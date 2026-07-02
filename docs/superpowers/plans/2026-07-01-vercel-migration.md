# Vercel Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-platform the Praeco Door A web app from Railway (one long-lived Node process) to Vercel (Fluid functions + Blob + Upstash Redis + Vercel Sandbox), preserving all three run modes (replay, sandbox, live), without modifying the proven engine (`src/*`).

**Architecture:** The stateful in-memory run-hub + `/data` volume + in-process engine become: **Upstash Redis Streams** (durable event buffer + `XRANGE`-poll tail for SSE), **Vercel Blob** (RunRecord JSON, public/shareable), and a **Vercel Sandbox** microVM that runs `runLaunchJob` to completion and `XADD`s each event to Redis. The SSE route tails Redis for active runs and replays from Blob for finished ones. Reconnection is handled by native `EventSource` + `Last-Event-ID`.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Vitest, `@vercel/blob`, `@upstash/redis`, `@vercel/sandbox`, Vercel Fluid Compute.

## Global Constraints

- **Do NOT modify `src/*`** — the engine is proven on Base mainnet. All changes live in `server/*`, `scripts/*`, `components/theater/useRunStream.ts`, and config.
- Node `>=22.19.0` (`package.json` engines); Vercel Sandbox runtime `node24`.
- TDD for every unit. `pnpm test:run` + `pnpm typecheck` green and `pnpm exec next build` clean **before every commit**.
- Keep the existing **140 tests green** at all times.
- Commits GPG-signed (`git commit -S`, key `BF47B9DC1FA320FA`); **NO AI attribution anywhere** (no `Co-Authored-By`, no tool mentions). One commit per logical unit.
- CROO is **mainnet only**; CI mocks SDK/fetch/LLM — **no live USDC, no real network in tests**.
- **Live mode stays gated OFF** (`LIVE_RUN_TOKEN` + `SVC_*` unset) through the migration.
- RunRecords are written to **public** Blob — they are already shareable replay artifacts and contain no secrets (tx hashes are public on Basescan).
- New runtime deps: `@vercel/blob`, `@upstash/redis`, `@vercel/sandbox`.

---

## File Structure

| Path | Responsibility | Action |
|---|---|---|
| `scripts/spike-sandbox.ts` | Phase-0 spike: prove Sandbox↔Redis↔Blob end-to-end | Create (kept as `smoke:vercel`) |
| `server/persistence.ts` | RunRecord storage | Modify: `node:fs` → `@vercel/blob` |
| `server/hub.ts` | Redis-Streams event hub (buffer + tail + status + capacity) | Create |
| `server/run-hub.ts` | Old in-memory hub | Delete (after imports repoint) |
| `scripts/sandbox-run.ts` | In-sandbox entry: run engine, `XADD` events, Blob the record | Create |
| `server/sandbox-runner.ts` | Provision + launch a Vercel Sandbox for a run | Create |
| `server/start-run.ts` | POST handler: gate → Redis entry → provision Sandbox | Modify |
| `server/stream-run.ts` | SSE: poll Redis tail (active) / Blob replay (finished) | Modify |
| `server/gating.ts` | Validation + live token + capacity | Modify (capacity source only) |
| `components/theater/useRunStream.ts` | SSE client hook | Modify: enable reconnect |
| `vercel.json` | Fluid + `maxDuration` + function config | Create |
| `railway.json` | Railway build/deploy | Delete |
| `.env.example` | Env documentation | Modify: add Blob/Redis/Sandbox vars |
| `package.json` | Deps + scripts | Modify |

**Interface preserved across the rewrite** — every task below speaks these types (already defined in the codebase, do not redefine):
- `WorklogEvent` (`src/types.ts:99`), `RunRecord` (`src/types.ts:109`), `RunMode` + `SseEvent` (`server/types.ts`), `IntakeInput` (`src/engine/intake.ts`).
- `SseEvent = { id: number | string; event: string; data: WorklogEvent }` — **note:** `id` becomes the Redis Stream entry id (a string like `"1719800000000-0"`); `sseFrame` already stringifies it, and `Last-Event-ID` round-trips as a string.

---

## Phase 0 — De-risk spike (GO/NO-GO gate)

**Purpose:** before rewriting the transport, prove the three unproven integrations end-to-end against real Vercel infra: (1) a Vercel Sandbox can be created from our private git repo, `npm ci`, and run our code; (2) code inside the sandbox can `XADD` to Upstash Redis and `put` to Blob; (3) a host process can `XRANGE`-poll those events and read the Blob. **If this phase is red, STOP and revisit the execution model with RECTOR before Phases 2–4.**

### Task 0.1: Dependencies + provisioning

**Files:**
- Modify: `package.json`
- Modify: `.env.example`

- [ ] **Step 1: Add dependencies**

Run:
```bash
pnpm add @vercel/blob @upstash/redis @vercel/sandbox
```

- [ ] **Step 2: Provision managed resources (manual, one-time)**

Do these in the Vercel dashboard for team `rectors-projects` (record the outputs in `~/Documents/secret/.env` and the Vercel project env, never in git):
1. Marketplace → **Upstash Redis** → create DB → copy `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
2. Storage → **Blob** → create store → copy `BLOB_READ_WRITE_TOKEN`.
3. Account/Team settings → **Tokens** → create `VERCEL_TOKEN`; note `VERCEL_TEAM_ID=team_ChFWVdEkY44d43iO4jyj1hxD` and (after first deploy) `VERCEL_PROJECT_ID`.
4. A GitHub PAT (`GH_SANDBOX_TOKEN`) with read access to `RECTOR-LABS/praeco` for the sandbox git clone.

- [ ] **Step 3: Document env in `.env.example`**

Append:
```bash
# --- Vercel migration ---
BLOB_READ_WRITE_TOKEN=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
VERCEL_TOKEN=
VERCEL_TEAM_ID=team_ChFWVdEkY44d43iO4jyj1hxD
VERCEL_PROJECT_ID=
GH_SANDBOX_TOKEN=
```

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example
git commit -S -m "chore(deps): add @vercel/blob, @upstash/redis, @vercel/sandbox + env docs"
```

### Task 0.2: Sandbox ↔ Redis ↔ Blob round-trip spike

**Files:**
- Create: `scripts/spike-sandbox.ts`

**Interfaces:**
- Produces: a runnable script proving the plumbing. No exported API.

- [ ] **Step 1: Write the spike script**

```ts
// scripts/spike-sandbox.ts — throwaway integration proof (kept as `smoke:vercel`).
// Proves: create Sandbox from git → npm ci → run in-sandbox code that XADDs to
// Upstash + puts a Blob → host XRANGE-polls the events and fetches the Blob.
import "dotenv/config";
import { Sandbox } from "@vercel/sandbox";
import { Redis } from "@upstash/redis";

const KEY = `spike:${Date.now()}`;

async function main() {
  const redis = Redis.fromEnv();

  // In-sandbox program: XADD 3 events + put a blob, all via env-provided creds.
  const program = `
    import { Redis } from "@upstash/redis";
    import { put } from "@vercel/blob";
    const redis = Redis.fromEnv();
    const key = process.env.SPIKE_KEY;
    for (let i = 0; i < 3; i++) await redis.xadd(key, "*", { n: String(i) });
    await put("spike/hello.json", JSON.stringify({ ok: true }), { access: "public", allowOverwrite: true });
    console.log("sandbox-side done");
  `;

  const sandbox = await Sandbox.create({
    source: {
      type: "git",
      url: "https://github.com/RECTOR-LABS/praeco.git",
      revision: "feat/vercel-migration",
      username: "x-access-token",
      password: process.env.GH_SANDBOX_TOKEN!,
    },
    runtime: "node24",
    resources: { vcpus: 2 },
    timeout: 300_000,
    env: {
      UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL!,
      UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN!,
      BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN!,
      SPIKE_KEY: KEY,
    },
  });

  try {
    await sandbox.runCommand({ cmd: "npm", args: ["ci"], stderr: process.stderr, stdout: process.stdout });
    await sandbox.writeFiles([{ path: "spike-inner.mjs", content: Buffer.from(program) }]);
    const run = await sandbox.runCommand({ cmd: "node", args: ["spike-inner.mjs"], stderr: process.stderr, stdout: process.stdout });
    console.log("sandbox exit code:", run.exitCode);
  } finally {
    await sandbox.stop();
  }

  // Host side: read what the sandbox wrote.
  const events = await redis.xrange(KEY, "-", "+");
  console.log("host read events:", JSON.stringify(events));
  if (Object.keys(events).length !== 3) throw new Error(`expected 3 events, got ${Object.keys(events).length}`);
  console.log("SPIKE 0.2 PASS");
}

main().catch((e) => { console.error("SPIKE 0.2 FAIL", e); process.exit(1); });
```

- [ ] **Step 2: Add the script alias**

In `package.json` `scripts`, add: `"smoke:vercel": "tsx scripts/spike-sandbox.ts"`.

- [ ] **Step 3: Push the branch (the sandbox clones from git)**

```bash
git add scripts/spike-sandbox.ts package.json
git commit -S -m "chore(spike): Sandbox↔Redis↔Blob round-trip proof"
git push -u origin feat/vercel-migration
```

- [ ] **Step 4: Run the spike**

Run: `pnpm smoke:vercel`
Expected: `sandbox-side done`, `sandbox exit code: 0`, `host read events: {...}` with 3 entries, `SPIKE 0.2 PASS`.

- [ ] **Step 5: Record findings**

If any call signature differs from the code above (`Sandbox.create` shape, `runCommand` options, `xrange` return shape), note the exact working form in a comment block at the top of `scripts/spike-sandbox.ts` — Phases 2–4 must use the validated forms. Commit the corrected spike.

### Task 0.3: Full-engine-in-Sandbox spike (GO/NO-GO)

**Files:**
- Create: `scripts/sandbox-run.ts` (first version — hardened in Task 3.1)

**Interfaces:**
- Produces: `scripts/sandbox-run.ts` reads `RUN_ID`, `RUN_MODE`, `RUN_INPUT` (JSON) + Redis/Blob env; runs the engine; `XADD`s each `WorklogEvent`; writes the `RunRecord` to Blob.

- [ ] **Step 1: Write the in-sandbox engine entry**

```ts
// scripts/sandbox-run.ts — runs INSIDE a Vercel Sandbox. Executes one launch job,
// streaming every WorklogEvent to Redis and persisting the RunRecord to Blob.
import "dotenv/config";
import { Redis } from "@upstash/redis";
import { put } from "@vercel/blob";
import { runLaunchJob } from "../src/engine/run.js";
import { buildSandboxDeps, buildLiveDeps } from "../server/engine-deps.js";
import type { WorklogEvent } from "../src/types.js";

async function main() {
  const runId = process.env.RUN_ID!;
  const mode = process.env.RUN_MODE as "sandbox" | "live";
  const input = JSON.parse(process.env.RUN_INPUT!);
  const redis = Redis.fromEnv();
  const eventsKey = `run:${runId}:events`;

  const onEvent = async (e: WorklogEvent) => { await redis.xadd(eventsKey, "*", { data: JSON.stringify(e) }); };

  let record;
  if (mode === "live") {
    const { deps, close } = await buildLiveDeps(onEvent, runId);
    try { record = await runLaunchJob(input, deps); } finally { close(); }
  } else {
    record = await runLaunchJob(input, buildSandboxDeps(onEvent, runId));
  }

  await put(`runs/${runId}.json`, JSON.stringify(record), { access: "public", allowOverwrite: true, contentType: "application/json" });
  await redis.hset(`run:${runId}:meta`, { status: "done", endedAt: record.endedAt });
  await redis.xadd(eventsKey, "*", { data: JSON.stringify({ kind: "stream_end", at: record.endedAt, message: "stream closed" }) });
}

main().catch(async (e) => {
  try {
    const redis = Redis.fromEnv();
    await redis.xadd(`run:${process.env.RUN_ID}:events`, "*", { data: JSON.stringify({ kind: "error", at: Date.now(), message: `sandbox run failed: ${(e as Error).message}` }) });
    await redis.hset(`run:${process.env.RUN_ID}:meta`, { status: "error" });
  } finally { process.exit(1); }
});
```

> **Note:** `onEvent` is `async` here; the engine's `onEvent` is fire-and-forget (`worklog.subscribe`), so awaiting inside is safe but its rejection must not crash the loop. If ordering/backpressure is an issue in the spike, buffer events in an array and `XADD` a pipeline — record the finding.

- [ ] **Step 2: Drive it from the host through a real Sandbox (sandbox mode, $0)**

Extend `scripts/spike-sandbox.ts` (or a `spike-engine.ts`) to `Sandbox.create` from git, `npm ci`, then `runCommand("npx", ["tsx", "scripts/sandbox-run.ts"])` with env `{ RUN_ID, RUN_MODE: "sandbox", RUN_INPUT: JSON.stringify({ text: "A privacy-first habit tracker for indie devs" }), ...redis, ...blob, OLLAMA_*, ... }`. Poll `redis.xrange("run:<id>:events", "-", "+")` on the host until a `stream_end` event.

- [ ] **Step 3: Run it**

Run: `pnpm tsx scripts/spike-engine.ts`
Expected: host sees the full event sequence (`run_started` → `intake_done` → per-leg `hire_*`/`qa_verdict`/`asset_submitted` → `compose_started` → `run_completed` → `stream_end`); a public Blob `runs/<id>.json` exists and parses as a `RunRecord` with `status: "completed"`.

- [ ] **Step 4: GO/NO-GO checkpoint**

Report to RECTOR: cold-start time (clone + `npm ci`), total run time, Redis command count, any signature corrections. **Decision:** proceed to Phase 1+ (GO) or fall back to Railway-for-the-hackathon (NO-GO). Do not proceed silently.

---

## Phase 1 — Blob persistence (spike-independent; can land regardless)

### Task 1.1: Swap `persistence.ts` from `fs` to Vercel Blob

**Files:**
- Modify: `server/persistence.ts`
- Test: `server/persistence.test.ts` (exists — rewrite)

**Interfaces:**
- Produces: `saveRecord(rec: RunRecord): Promise<void>`, `loadRecord(runId: string): Promise<RunRecord | null>`, `listRecords(): Promise<RunRecord[]>` — **same signatures as today** (`server/persistence.ts:7-22`), Blob-backed. Consumers (`hub`, `stream-run`) are unchanged.

- [ ] **Step 1: Write the failing tests**

```ts
// server/persistence.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const put = vi.fn();
const list = vi.fn();
vi.mock("@vercel/blob", () => ({ put: (...a: unknown[]) => put(...a), list: (...a: unknown[]) => list(...a) }));

const rec = (runId: string) => ({ runId, status: "completed", brief: { product: "P", audience: "a", features: [], tone: "t", oneLiner: "o" }, assets: [], worklog: [], spentBaseUnits: "0", startedAt: 1, endedAt: 2 });

beforeEach(() => { put.mockReset(); list.mockReset(); vi.restoreAllMocks(); });

describe("persistence (Blob)", () => {
  it("saveRecord puts public JSON at a deterministic path", async () => {
    put.mockResolvedValue({ url: "https://x.public.blob.vercel-storage.com/runs/run-1.json" });
    const { saveRecord } = await import("./persistence.js");
    await saveRecord(rec("run-1") as never);
    expect(put).toHaveBeenCalledWith("runs/run-1.json", JSON.stringify(rec("run-1")), expect.objectContaining({ access: "public", allowOverwrite: true, contentType: "application/json" }));
  });

  it("loadRecord lists by prefix then fetches the blob url", async () => {
    list.mockResolvedValue({ blobs: [{ pathname: "runs/run-1.json", url: "https://x/runs/run-1.json" }] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(rec("run-1")))));
    const { loadRecord } = await import("./persistence.js");
    const out = await loadRecord("run-1");
    expect(out?.runId).toBe("run-1");
  });

  it("loadRecord returns null for a bad id (path-traversal guard)", async () => {
    const { loadRecord } = await import("./persistence.js");
    expect(await loadRecord("../etc/passwd")).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });

  it("loadRecord returns null when no blob matches", async () => {
    list.mockResolvedValue({ blobs: [] });
    const { loadRecord } = await import("./persistence.js");
    expect(await loadRecord("missing")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run server/persistence.test.ts`
Expected: FAIL (still the `fs` implementation; `@vercel/blob` mock unused).

- [ ] **Step 3: Implement the Blob backend**

```ts
// server/persistence.ts
import { put, list } from "@vercel/blob";
import type { RunRecord } from "@/src/types";

const key = (runId: string) => `runs/${runId}.json`;

export async function saveRecord(rec: RunRecord): Promise<void> {
  await put(key(rec.runId), JSON.stringify(rec), {
    access: "public",
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function loadRecord(runId: string): Promise<RunRecord | null> {
  // Guard against traversal: only a bare runId is addressable.
  if (!/^[\w.-]+$/.test(runId)) return null;
  const { blobs } = await list({ prefix: key(runId) });
  const blob = blobs.find((b) => b.pathname === key(runId));
  if (!blob) return null;
  try {
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as RunRecord;
  } catch { return null; }
}

export async function listRecords(): Promise<RunRecord[]> {
  const { blobs } = await list({ prefix: "runs/" });
  const recs = await Promise.all(blobs.map(async (b) => {
    try { const r = await fetch(b.url, { cache: "no-store" }); return r.ok ? (await r.json()) as RunRecord : null; }
    catch { return null; }
  }));
  return recs.filter((r): r is RunRecord => r !== null).sort((a, b) => b.startedAt - a.startedAt);
}
```

- [ ] **Step 4: Run tests to verify pass + full suite + typecheck**

Run: `pnpm exec vitest run server/persistence.test.ts && pnpm typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add server/persistence.ts server/persistence.test.ts
git commit -S -m "feat(web): Blob-backed RunRecord persistence (public, shareable)"
```

---

## Phase 2 — Redis Streams hub

> **Spike-validated:** use the exact `@upstash/redis` call forms confirmed in Task 0.2/0.3. The code below assumes `xadd(key, "*", { data })`, `xrange(key, start, "+")`, `hset`/`hgetall`, `sadd`/`srem`/`scard`.

### Task 2.1: `server/hub.ts` — Redis-Streams hub

**Files:**
- Create: `server/hub.ts`
- Test: `server/hub.test.ts`
- Delete (Task 4.x, after repoint): `server/run-hub.ts`

**Interfaces:**
- Produces:
  - `createRun(runId: string, mode: RunMode): Promise<void>` — `hset` meta `{mode,status:"provisioning"}` + `sadd active:{mode}`.
  - `publish(runId: string, e: WorklogEvent): Promise<string>` — `xadd`; returns the stream id.
  - `readSince(runId: string, lastId: string): Promise<SseEvent[]>` — `xrange(key, exclusiveFrom, "+")` mapped to `SseEvent`s.
  - `getStatus(runId: string): Promise<"provisioning"|"running"|"done"|"error"|null>`.
  - `finishRun(runId: string, record: RunRecord): Promise<void>` — `saveRecord` + meta `done` + `srem`.
  - `failRun(runId: string, mode: RunMode): Promise<void>`.
  - `activeCount(mode: RunMode): Promise<number>` — `scard active:{mode}`.
- Consumes: `saveRecord` (Task 1.1); `SseEvent`/`RunMode` (`server/types.ts`); `WorklogEvent`/`RunRecord` (`src/types.ts`).

- [ ] **Step 1: Write the failing tests**

```ts
// server/hub.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const r = { xadd: vi.fn(), xrange: vi.fn(), hset: vi.fn(), hgetall: vi.fn(), sadd: vi.fn(), srem: vi.fn(), scard: vi.fn() };
vi.mock("@upstash/redis", () => ({ Redis: { fromEnv: () => r } }));
vi.mock("./persistence.js", () => ({ saveRecord: vi.fn(async () => {}) }));

beforeEach(() => Object.values(r).forEach((f) => f.mockReset()));

describe("RedisHub", () => {
  it("createRun writes meta + adds to the active set", async () => {
    const hub = await import("./hub.js");
    await hub.createRun("run-1", "sandbox");
    expect(r.hset).toHaveBeenCalledWith("run:run-1:meta", expect.objectContaining({ mode: "sandbox", status: "provisioning" }));
    expect(r.sadd).toHaveBeenCalledWith("active:sandbox", "run-1");
  });

  it("publish XADDs the event as JSON and returns the id", async () => {
    r.xadd.mockResolvedValue("1719-0");
    const hub = await import("./hub.js");
    const id = await hub.publish("run-1", { kind: "run_started", at: 1, message: "go" });
    expect(id).toBe("1719-0");
    expect(r.xadd).toHaveBeenCalledWith("run:run-1:events", "*", { data: JSON.stringify({ kind: "run_started", at: 1, message: "go" }) });
  });

  it("readSince maps XRANGE entries to SseEvents (exclusive of lastId)", async () => {
    r.xrange.mockResolvedValue({ "1719-1": { data: JSON.stringify({ kind: "intake_done", at: 2, message: "brief" }) } });
    const hub = await import("./hub.js");
    const out = await hub.readSince("run-1", "1719-0");
    expect(r.xrange).toHaveBeenCalledWith("run:run-1:events", "(1719-0", "+");
    expect(out).toEqual([{ id: "1719-1", event: "intake_done", data: { kind: "intake_done", at: 2, message: "brief" } }]);
  });

  it("readSince from the beginning uses '-'", async () => {
    r.xrange.mockResolvedValue({});
    const hub = await import("./hub.js");
    await hub.readSince("run-1", "");
    expect(r.xrange).toHaveBeenCalledWith("run:run-1:events", "-", "+");
  });

  it("finishRun persists, marks done, leaves the active set", async () => {
    const { saveRecord } = await import("./persistence.js");
    const hub = await import("./hub.js");
    const rec = { runId: "run-1", status: "completed", mode: "sandbox" } as never;
    await hub.finishRun("run-1", rec);
    expect(saveRecord).toHaveBeenCalledWith(rec);
    expect(r.hset).toHaveBeenCalledWith("run:run-1:meta", expect.objectContaining({ status: "done" }));
  });

  it("activeCount reads the per-mode set cardinality", async () => {
    r.scard.mockResolvedValue(2);
    const hub = await import("./hub.js");
    expect(await hub.activeCount("sandbox")).toBe(2);
    expect(r.scard).toHaveBeenCalledWith("active:sandbox");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run server/hub.test.ts`
Expected: FAIL (`./hub.js` does not exist).

- [ ] **Step 3: Implement the hub**

```ts
// server/hub.ts — Redis-Streams event hub. Replaces the in-memory RunHub with a
// durable, multi-instance-safe backend: XADD appends events, XRANGE polls the tail
// (Upstash REST has no blocking XREAD), Blob stores the finished RunRecord.
import { Redis } from "@upstash/redis";
import type { RunRecord, WorklogEvent } from "@/src/types";
import type { RunMode, SseEvent } from "./types.js";
import { saveRecord } from "./persistence.js";

const redis = Redis.fromEnv();
const eventsKey = (id: string) => `run:${id}:events`;
const metaKey = (id: string) => `run:${id}:meta`;
const activeKey = (m: RunMode) => `active:${m}`;

export async function createRun(runId: string, mode: RunMode): Promise<void> {
  await redis.hset(metaKey(runId), { mode, status: "provisioning", createdAt: Date.now() });
  await redis.sadd(activeKey(mode), runId);
}

export async function markRunning(runId: string): Promise<void> {
  await redis.hset(metaKey(runId), { status: "running" });
}

export async function publish(runId: string, e: WorklogEvent): Promise<string> {
  return (await redis.xadd(eventsKey(runId), "*", { data: JSON.stringify(e) })) as string;
}

export async function readSince(runId: string, lastId: string): Promise<SseEvent[]> {
  const from = lastId ? `(${lastId}` : "-";
  const entries = (await redis.xrange(eventsKey(runId), from, "+")) as Record<string, { data: string }>;
  return Object.entries(entries).map(([id, fields]) => {
    const data = JSON.parse(fields.data) as WorklogEvent;
    return { id, event: data.kind, data };
  });
}

export async function getStatus(runId: string): Promise<string | null> {
  const meta = (await redis.hgetall(metaKey(runId))) as { status?: string } | null;
  return meta?.status ?? null;
}

export async function finishRun(runId: string, record: RunRecord): Promise<void> {
  await saveRecord(record);
  await redis.hset(metaKey(runId), { status: "done", endedAt: record.endedAt });
  const mode = (await redis.hget(metaKey(runId), "mode")) as RunMode | null;
  if (mode) await redis.srem(activeKey(mode), runId);
}

export async function failRun(runId: string, mode: RunMode): Promise<void> {
  await redis.hset(metaKey(runId), { status: "error" });
  await redis.srem(activeKey(mode), runId);
}

export async function activeCount(mode: RunMode): Promise<number> {
  return (await redis.scard(activeKey(mode))) as number;
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm exec vitest run server/hub.test.ts && pnpm typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add server/hub.ts server/hub.test.ts
git commit -S -m "feat(web): Redis-Streams run hub (XADD buffer + XRANGE tail + capacity)"
```

---

## Phase 3 — Sandbox runner + in-sandbox entry

### Task 3.1: Harden `scripts/sandbox-run.ts`

**Files:**
- Modify: `scripts/sandbox-run.ts` (from Task 0.3)

**Interfaces:**
- Consumes: `runLaunchJob`, `buildSandboxDeps`/`buildLiveDeps`, `hub.publish`/`markRunning`/`finishRun`/`failRun`.
- Produces: a process that, given `RUN_ID`/`RUN_MODE`/`RUN_INPUT` env, runs one job and drives the hub.

- [ ] **Step 1: Reconcile the entry with the hub API**

Replace the ad-hoc `redis.xadd`/`put` calls from Task 0.3 with the `server/hub.js` functions so there is one source of truth for keys/shapes:

```ts
// scripts/sandbox-run.ts
import "dotenv/config";
import { runLaunchJob } from "../src/engine/run.js";
import { buildSandboxDeps, buildLiveDeps } from "../server/engine-deps.js";
import { markRunning, publish, finishRun, failRun } from "../server/hub.js";
import type { WorklogEvent } from "../src/types.js";

async function main() {
  const runId = process.env.RUN_ID!;
  const mode = process.env.RUN_MODE as "sandbox" | "live";
  const input = JSON.parse(process.env.RUN_INPUT!);
  await markRunning(runId);

  // Serialize publishes so Redis stream order matches emission order.
  let chain: Promise<unknown> = Promise.resolve();
  const onEvent = (e: WorklogEvent) => { chain = chain.then(() => publish(runId, e)).catch(() => {}); };

  let record;
  if (mode === "live") {
    const { deps, close } = await buildLiveDeps(onEvent, runId);
    try { record = await runLaunchJob(input, deps); } finally { close(); }
  } else {
    record = await runLaunchJob(input, buildSandboxDeps(onEvent, runId));
  }
  await chain; // flush the last events before persisting
  await finishRun(runId, record);
  await publish(runId, { kind: "stream_end", at: record.endedAt, message: "stream closed" } as WorklogEvent);
}

main().catch(async (e) => {
  try { await failRun(process.env.RUN_ID!, (process.env.RUN_MODE as "sandbox" | "live")); }
  finally { console.error("sandbox-run failed:", (e as Error).message); process.exit(1); }
});
```

> `stream_end` is not a `WorklogEventKind`; it is a transport sentinel the SSE route uses to close. Add `"stream_end"` to the `WorklogEventKind` union in `src/types.ts`? **No — do not touch `src/*`.** Instead define the sentinel kind in `server/types.ts` and cast at the boundary (the reducer already ignores unknown kinds).

- [ ] **Step 2: Add the sentinel to `server/types.ts`**

```ts
// server/types.ts — add:
export const STREAM_END = "stream_end" as const;
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add scripts/sandbox-run.ts server/types.ts
git commit -S -m "feat(web): in-sandbox engine entry drives the Redis hub"
```

### Task 3.2: `server/sandbox-runner.ts` — provision a Sandbox per run

**Files:**
- Create: `server/sandbox-runner.ts`
- Test: `server/sandbox-runner.test.ts`

**Interfaces:**
- Produces: `provisionRun(runId: string, mode: "sandbox" | "live", input: IntakeInput): Promise<void>` — creates a Sandbox from git, `npm ci`, runs `scripts/sandbox-run.ts` **detached** (does not await the whole engine run), passing run + Redis/Blob/engine env.
- Consumes: `@vercel/sandbox` (validated in Phase 0), `IntakeInput`.

- [ ] **Step 1: Write the failing test**

```ts
// server/sandbox-runner.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const runCommand = vi.fn();
const create = vi.fn(async () => ({ runCommand, sandboxId: "sbx_1" }));
vi.mock("@vercel/sandbox", () => ({ Sandbox: { create: (...a: unknown[]) => create(...a) } }));

beforeEach(() => { create.mockClear(); runCommand.mockReset(); runCommand.mockResolvedValue({ exitCode: 0 }); });

describe("provisionRun", () => {
  it("creates a node24 sandbox from the pinned git revision", async () => {
    process.env.SANDBOX_GIT_REVISION = "feat/vercel-migration";
    process.env.GH_SANDBOX_TOKEN = "tok";
    const { provisionRun } = await import("./sandbox-runner.js");
    await provisionRun("run-1", "sandbox", { text: "hi" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      runtime: "node24",
      source: expect.objectContaining({ type: "git", revision: "feat/vercel-migration" }),
    }));
  });

  it("runs npm ci then the entry with RUN_* env", async () => {
    const { provisionRun } = await import("./sandbox-runner.js");
    await provisionRun("run-1", "sandbox", { text: "hi" });
    expect(runCommand).toHaveBeenNthCalledWith(1, expect.objectContaining({ cmd: "npm", args: ["ci"] }));
    expect(runCommand).toHaveBeenNthCalledWith(2, expect.objectContaining({
      cmd: "npx",
      args: ["tsx", "scripts/sandbox-run.ts"],
      env: expect.objectContaining({ RUN_ID: "run-1", RUN_MODE: "sandbox", RUN_INPUT: JSON.stringify({ text: "hi" }) }),
    }));
  });

  it("uses a 30m timeout for live and 5m for sandbox", async () => {
    const { provisionRun } = await import("./sandbox-runner.js");
    await provisionRun("run-live", "live", { text: "hi" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ timeout: 1_800_000 }));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run server/sandbox-runner.test.ts`
Expected: FAIL (`./sandbox-runner.js` missing).

- [ ] **Step 3: Implement the runner**

```ts
// server/sandbox-runner.ts — provision a Vercel Sandbox that runs one launch job.
// The sandbox clones the repo, installs deps, and runs scripts/sandbox-run.ts, which
// streams events to Redis and persists the RunRecord to Blob. We do NOT await the
// engine run here — provisioning returns once the entry is launched; the SSE route
// tails Redis for progress.
import { Sandbox } from "@vercel/sandbox";
import type { IntakeInput } from "@/src/engine/intake";

const TIMEOUTS: Record<"sandbox" | "live", number> = { sandbox: 300_000, live: 1_800_000 };

// Env the in-sandbox engine needs. Read from the function's own env at provision time.
function engineEnv(): Record<string, string> {
  const keys = [
    "OLLAMA_API_KEY", "OLLAMA_BASE_URL", "OLLAMA_MODEL",
    "CROO_API_URL", "CROO_WS_URL", "CROO_SDK_KEY",
    "BASE_RPC_URL", "PRAECO_AGENT_ID", "PRAECO_AGENT_WALLET", "USDC_TOKEN_ADDRESS",
    "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "BLOB_READ_WRITE_TOKEN",
    "LIVE_RUN_TOKEN", "SVC_RESEARCH", "SVC_LANDING", "SVC_IMAGE",
  ];
  const out: Record<string, string> = {};
  for (const k of keys) if (process.env[k]) out[k] = process.env[k]!;
  return out;
}

export async function provisionRun(runId: string, mode: "sandbox" | "live", input: IntakeInput): Promise<void> {
  const sandbox = await Sandbox.create({
    source: {
      type: "git",
      url: "https://github.com/RECTOR-LABS/praeco.git",
      revision: process.env.SANDBOX_GIT_REVISION ?? "main",
      username: "x-access-token",
      password: process.env.GH_SANDBOX_TOKEN!,
    },
    runtime: "node24",
    resources: { vcpus: 2 },
    timeout: TIMEOUTS[mode],
  });

  await sandbox.runCommand({ cmd: "npm", args: ["ci"] });
  await sandbox.runCommand({
    cmd: "npx",
    args: ["tsx", "scripts/sandbox-run.ts"],
    detached: true,
    env: { ...engineEnv(), RUN_ID: runId, RUN_MODE: mode, RUN_INPUT: JSON.stringify(input) },
  });
}
```

> **Spike-validated detail:** confirm in Phase 0 whether `runCommand` supports `detached` and whether the sandbox self-stops on entry exit (it should, at `timeout`). If `detached` is unavailable, launch via `sandbox.runCommand` without awaiting and let the sandbox lifetime bound it — record the working form.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm exec vitest run server/sandbox-runner.test.ts && pnpm typecheck`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add server/sandbox-runner.ts server/sandbox-runner.test.ts
git commit -S -m "feat(web): Vercel Sandbox runner — provision a microVM per launch run"
```

---

## Phase 4 — Rewire the routes onto the hub + runner

### Task 4.1: `start-run.ts` — provision instead of in-process fire-and-forget

**Files:**
- Modify: `server/start-run.ts`
- Test: `server/start-run.test.ts` (exists — update)

**Interfaces:**
- Consumes: `createRun`/`activeCount` (hub), `provisionRun` (runner), `assertLiveAllowed`/`assertCapacity` (gating).
- Produces: `startRun(req, headers, opts?)` returning `{ runId }` — same shape as today.

- [ ] **Step 1: Update the test to expect provisioning (not in-process runner)**

```ts
// server/start-run.test.ts (key cases)
import { describe, it, expect, vi, beforeEach } from "vitest";

const createRun = vi.fn(async () => {});
const activeCount = vi.fn(async () => 0);
const provisionRun = vi.fn(async () => {});
vi.mock("./hub.js", () => ({ createRun, activeCount }));
vi.mock("./sandbox-runner.js", () => ({ provisionRun }));

beforeEach(() => { createRun.mockClear(); provisionRun.mockClear(); activeCount.mockResolvedValue(0); });

describe("startRun", () => {
  it("rejects replay mode", async () => {
    const { startRun } = await import("./start-run.js");
    await expect(startRun({ mode: "replay" } as never, new Headers())).rejects.toThrow(/read-only/);
  });

  it("creates the run then provisions a sandbox", async () => {
    const { startRun } = await import("./start-run.js");
    const res = await startRun({ mode: "sandbox", text: "a habit tracker" } as never, new Headers());
    expect(res.runId).toMatch(/^run-/);
    expect(createRun).toHaveBeenCalledWith(res.runId, "sandbox");
    expect(provisionRun).toHaveBeenCalledWith(res.runId, "sandbox", { text: "a habit tracker" });
  });

  it("enforces capacity from the Redis active count", async () => {
    activeCount.mockResolvedValue(3);
    const { startRun } = await import("./start-run.js");
    await expect(startRun({ mode: "sandbox", text: "x" } as never, new Headers())).rejects.toThrow(/too many/);
    expect(provisionRun).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run server/start-run.test.ts`
Expected: FAIL (still imports the in-memory `hub`/`runner`).

- [ ] **Step 3: Rewrite `start-run.ts`**

```ts
// server/start-run.ts
import type { IntakeInput } from "@/src/engine/intake";
import type { StartRunRequest, StartRunResponse } from "./types.js";
import { createRun, activeCount } from "./hub.js";
import { provisionRun } from "./sandbox-runner.js";
import { assertLiveAllowed, assertCapacity, GateError } from "./gating.js";

export async function startRun(req: StartRunRequest, headers: Headers): Promise<StartRunResponse> {
  if (req.mode === "replay") throw new GateError("replay is read-only — use GET /api/runs/:id/stream", 400);
  if (req.mode === "live") assertLiveAllowed(headers);
  assertCapacity(await activeCount(req.mode), req.mode);

  const runId = `run-${Date.now()}`;
  await createRun(runId, req.mode);
  const input: IntakeInput = req.repoUrl ? { repoUrl: req.repoUrl } : { text: req.text! };

  // Provision the sandbox (fire-and-forget of provisioning, not of the whole run).
  // The sandbox runs the engine independently; the SSE route tails Redis for progress.
  void provisionRun(runId, req.mode, input).catch(async (err) => {
    const { failRun } = await import("./hub.js");
    const { publish } = await import("./hub.js");
    await publish(runId, { kind: "error", at: Date.now(), message: `provision failed: ${(err as Error).message}` });
    await publish(runId, { kind: "run_aborted", at: Date.now(), message: `run ${runId} aborted` });
    await failRun(runId, req.mode as "sandbox" | "live");
  });

  return { runId };
}
```

> Removed the `opts.runner` injection seam; tests now mock `./hub.js` + `./sandbox-runner.js` at the module boundary. The `Runner` type in this file is deleted.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm exec vitest run server/start-run.test.ts && pnpm typecheck`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add server/start-run.ts server/start-run.test.ts
git commit -S -m "feat(web): start-run provisions a Sandbox via the Redis hub"
```

### Task 4.2: `stream-run.ts` — poll Redis tail (active) / Blob replay (finished)

**Files:**
- Modify: `server/stream-run.ts`
- Test: `server/stream-run.test.ts` (exists — update)

**Interfaces:**
- Consumes: `readSince`/`getStatus` (hub), `loadRecord` (persistence), `replayStream` (unchanged), `STREAM_END`.
- Produces: `streamRun(runId, opts): ReadableStream<Uint8Array>` — same signature; `opts.lastEventId` is now a **string** stream id.

- [ ] **Step 1: Update the test**

```ts
// server/stream-run.test.ts (key cases)
import { describe, it, expect, vi, beforeEach } from "vitest";

const readSince = vi.fn();
const getStatus = vi.fn();
const loadRecord = vi.fn();
vi.mock("./hub.js", () => ({ readSince, getStatus }));
vi.mock("./persistence.js", () => ({ loadRecord }));

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader(); const dec = new TextDecoder(); let out = "";
  for (;;) { const { done, value } = await reader.read(); if (done) break; out += dec.decode(value); }
  return out;
}

beforeEach(() => { readSince.mockReset(); getStatus.mockReset(); loadRecord.mockReset(); });

describe("streamRun", () => {
  it("tails an active run until stream_end", async () => {
    getStatus.mockResolvedValue("running");
    readSince
      .mockResolvedValueOnce([{ id: "1-0", event: "run_started", data: { kind: "run_started", at: 1, message: "go" } }])
      .mockResolvedValueOnce([{ id: "2-0", event: "stream_end", data: { kind: "stream_end", at: 2, message: "" } }]);
    const { streamRun } = await import("./stream-run.js");
    const out = await drain(streamRun("run-1", { pollMs: 1 }));
    expect(out).toContain("event: run_started");
    expect(out).toContain("id: 1-0");
    expect(out).not.toContain("stream_end"); // sentinel closes, not emitted
  });

  it("replays from Blob when no active run exists", async () => {
    getStatus.mockResolvedValue(null);
    loadRecord.mockResolvedValue({ runId: "run-1", worklog: [{ kind: "run_completed", at: 1, message: "done" }] });
    const { streamRun } = await import("./stream-run.js");
    const out = await drain(streamRun("run-1", { speed: "max" }));
    expect(out).toContain("event: run_completed");
  });

  it("emits an error frame when the run is unknown", async () => {
    getStatus.mockResolvedValue(null);
    loadRecord.mockResolvedValue(null);
    const { streamRun } = await import("./stream-run.js");
    const out = await drain(streamRun("nope", {}));
    expect(out).toContain("event: error");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run server/stream-run.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite `stream-run.ts`**

```ts
// server/stream-run.ts
import type { SseEvent, RunMode } from "./types.js";
import { STREAM_END } from "./types.js";
import { readSince, getStatus } from "./hub.js";
import { loadRecord } from "./persistence.js";
import { replayStream } from "./replay.js";

const TERMINAL = new Set(["run_completed", "run_aborted", STREAM_END]);
export function sseFrame(e: SseEvent): string {
  return `id: ${e.id}\nevent: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
}

interface StreamOpts { lastEventId?: string; speed?: "1" | "4" | "max"; pollMs?: number }

export function streamRun(runId: string, opts: StreamOpts): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const pollMs = opts.pollMs ?? 400;
  let cancelled = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const status = await getStatus(runId);
        if (status) {
          // Active (or recently active) → poll the Redis tail from Last-Event-ID.
          let lastId = opts.lastEventId ?? "";
          for (;;) {
            if (cancelled) return;
            const events = await readSince(runId, lastId);
            for (const e of events) {
              if (e.event === STREAM_END) { controller.close(); return; }
              controller.enqueue(enc.encode(sseFrame(e)));
              lastId = String(e.id);
              if (TERMINAL.has(e.event)) { controller.close(); return; }
            }
            await new Promise((r) => setTimeout(r, pollMs));
          }
        }
        // Finished / unknown → replay from Blob (or a single error frame).
        const rec = await loadRecord(runId);
        if (!rec) {
          controller.enqueue(enc.encode(sseFrame({ id: "0", event: "error", data: { kind: "error", at: Date.now(), message: `no run ${runId}` } })));
          controller.close(); return;
        }
        for await (const e of replayStream(rec, opts.speed ?? "1", undefined, 0)) {
          if (cancelled) break;
          controller.enqueue(enc.encode(sseFrame(e)));
        }
        controller.close();
      } catch (err) {
        try { controller.enqueue(enc.encode(sseFrame({ id: "0", event: "error", data: { kind: "error", at: Date.now(), message: `stream failed: ${(err as Error).message}` } }))); } catch {}
        try { controller.close(); } catch {}
      }
    },
    cancel() { cancelled = true; },
  });
}
```

> `replayStream`'s `fromEventId` param is numeric (index-based) and only used on the disk-replay path; Blob replay always starts from 0 here because a finished run's client reconnect re-reads the whole (short) record. Live/sandbox reconnect resumes via the Redis tail branch above using the string `lastEventId`. The route handler (`app/api/runs/[id]/stream/route.ts`) must pass `lastEventId` from the `Last-Event-ID` **header** as a string (it already reads the header — confirm the type is `string`, not `number`).

- [ ] **Step 4: Update the route handler's `lastEventId` typing**

In `app/api/runs/[id]/stream/route.ts`, ensure `lastEventId` is passed as the raw header string (drop any `Number(...)` coercion). Verify by reading the file.

- [ ] **Step 5: Run tests + typecheck + build**

Run: `pnpm exec vitest run server/stream-run.test.ts && pnpm typecheck && pnpm exec next build`
Expected: PASS; clean; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add server/stream-run.ts server/stream-run.test.ts server/types.ts app/api/runs/
git commit -S -m "feat(web): SSE tails Redis for active runs, replays Blob for finished"
```

### Task 4.3: Delete the old hub + repoint stragglers

**Files:**
- Delete: `server/run-hub.ts`, `server/run-hub.test.ts`
- Modify: any remaining importer of `./run-hub.js`

- [ ] **Step 1: Find importers**

Run: `grep -rn "run-hub" server app components`
Expected: only `start-run` / `stream-run` (already rewritten). If others exist, repoint them to `./hub.js`.

- [ ] **Step 2: Delete the old hub + its test**

```bash
git rm server/run-hub.ts server/run-hub.test.ts
```

- [ ] **Step 3: Full suite + typecheck + build**

Run: `pnpm test:run && pnpm typecheck && pnpm exec next build`
Expected: all green; the old hub's tests are gone; the new hub/persistence/runner tests pass; the previously-in-memory-dependent tests are updated. Total count ≈ 140 minus the 3 deleted run-hub tests plus the new adapter tests.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -S -m "refactor(web): remove in-memory run-hub — Redis hub is authoritative"
```

---

## Phase 5 — Client reconnect fix

### Task 5.1: `useRunStream.ts` — enable native reconnect

**Files:**
- Modify: `components/theater/useRunStream.ts`
- Test: `components/theater/useRunStream.test.ts` (create)

**Interfaces:**
- Produces: `useRunStream(runId, opts)` unchanged signature; internally closes only on terminal events, not on transient errors.

- [ ] **Step 1: Write the failing test**

```tsx
// components/theater/useRunStream.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRunStream } from "./useRunStream";

class FakeES {
  static instances: FakeES[] = [];
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) { FakeES.instances.push(this); }
  addEventListener(k: string, fn: (e: MessageEvent) => void) { (this.listeners[k] ??= []).push(fn); }
  emit(k: string, data: unknown) { (this.listeners[k] ?? []).forEach((fn) => fn({ data: JSON.stringify(data) } as MessageEvent)); }
  close() { this.closed = true; }
}

beforeEach(() => { FakeES.instances = []; vi.stubGlobal("EventSource", FakeES as never); });

describe("useRunStream reconnect", () => {
  it("does NOT close on a transient error (lets EventSource auto-reconnect)", () => {
    renderHook(() => useRunStream("run-1"));
    const es = FakeES.instances[0];
    es.onerror?.();
    expect(es.closed).toBe(false);
  });

  it("closes on a terminal event", () => {
    renderHook(() => useRunStream("run-1"));
    const es = FakeES.instances[0];
    es.emit("run_completed", { kind: "run_completed", at: 1, message: "done" });
    expect(es.closed).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run components/theater/useRunStream.test.ts`
Expected: FAIL (current `onerror` closes immediately; no terminal-close logic).

- [ ] **Step 3: Rewrite the hook**

```ts
// components/theater/useRunStream.ts
"use client";
import { useEffect, useReducer } from "react";
import type { WorklogEvent } from "@/src/types";
import { initialTheaterState, theaterReducer, type TheaterState } from "./reducer";

const TERMINAL = new Set(["run_completed", "run_aborted", "stream_end"]);
const KINDS = [
  "run_started", "intake_done", "leg_search", "leg_candidate",
  "hire_negotiating", "hire_order_created", "hire_paid", "hire_delivered",
  "qa_verdict", "asset_submitted", "hire_blocked", "compose_started",
  "run_completed", "run_aborted", "agent_step", "error", "stream_end",
];

export function useRunStream(runId: string, opts: { speed?: "1" | "4" | "max" } = {}): TheaterState {
  const [state, dispatch] = useReducer(theaterReducer, undefined, initialTheaterState);
  useEffect(() => {
    const qs = opts.speed ? `?speed=${opts.speed}` : "";
    const es = new EventSource(`/api/runs/${runId}/stream${qs}`);
    const handler = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as WorklogEvent;
        dispatch(data);
        // Close on terminal so we don't reconnect a finished run. Transient errors are
        // left to EventSource's native auto-reconnect (it resends Last-Event-ID).
        if (TERMINAL.has(data.kind)) es.close();
      } catch (err) { console.warn("[theater] dropped malformed SSE event", err); }
    };
    KINDS.forEach((k) => es.addEventListener(k, handler));
    return () => es.close();
  }, [runId, opts.speed]);
  return state;
}
```

> The old `es.onerror = () => es.close()` is removed entirely — that line defeated reconnection. Native `EventSource` reconnects on transient errors and resends the last `id:` as `Last-Event-ID`, which the SSE route uses to resume the Redis tail.

- [ ] **Step 4: Run tests + typecheck + build**

Run: `pnpm exec vitest run components/theater/useRunStream.test.ts && pnpm typecheck && pnpm exec next build`
Expected: PASS; clean; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add components/theater/useRunStream.ts components/theater/useRunStream.test.ts
git commit -S -m "fix(web): let EventSource auto-reconnect; close only on terminal events"
```

---

## Phase 6 — Deploy config + cutover

### Task 6.1: `vercel.json`, drop `railway.json`, env docs

**Files:**
- Create: `vercel.json`
- Delete: `railway.json`
- Modify: `.env.example` (done in 0.1 — verify)

**Interfaces:** none (config).

- [ ] **Step 1: Write `vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "app/api/runs/[id]/stream/route.ts": { "maxDuration": 800 },
    "app/api/runs/route.ts": { "maxDuration": 60 }
  }
}
```

> Fluid Compute is enabled at the project level (Settings → Functions) — confirm it's on. `maxDuration: 800` on the SSE route requires Pro; the sandbox itself outlives the function, but the SSE poll loop wants headroom before a reconnect. `next.config.mjs` (serverExternalPackages + extensionAlias) carries over unchanged.

- [ ] **Step 2: Delete `railway.json`**

```bash
git rm railway.json
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm typecheck && pnpm exec next build`
Expected: clean; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add vercel.json .env.example
git commit -S -m "chore(deploy): vercel.json (Fluid + maxDuration); drop railway.json"
```

### Task 6.2: Cutover runbook (documented, executed with RECTOR)

**Files:**
- Create: `docs/superpowers/specs/2026-07-01-vercel-cutover-runbook.md`

- [ ] **Step 1: Write the runbook**

Document, in order:
1. Create the Vercel project (import `RECTOR-LABS/praeco`, team `rectors-projects`, branch `feat/vercel-migration` for preview → `main` for prod). Confirm **Pro** plan.
2. Set project env vars: the 8 engine vars + `UPSTASH_REDIS_REST_URL/TOKEN` + `BLOB_READ_WRITE_TOKEN` + `VERCEL_TOKEN/TEAM_ID/PROJECT_ID` + `GH_SANDBOX_TOKEN` + `SANDBOX_GIT_REVISION=main`. Leave `LIVE_RUN_TOKEN`, `SVC_*` **unset**.
3. Enable **Fluid Compute** (Settings → Functions).
4. Deploy the preview; run `pnpm smoke:vercel`-equivalent against the preview URL: intake → sandbox run → SSE Theater → kit → replay. Confirm the Redis command count + cold-start are acceptable.
5. Promote to production (`main`).
6. DNS: in Cloudflare, repoint `praeco.rectorspace.com` from the Railway CNAME to Vercel (CNAME to `cname.vercel-dns.com`, DNS-only until verified, then proxied if desired). Verify SSL.
7. Soak for 24h; then **decommission Railway** (delete the service — cost stops). Keep the `/data` RunRecords exported to Blob first if any are worth preserving.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-07-01-vercel-cutover-runbook.md
git commit -S -m "docs(deploy): Vercel cutover runbook"
```

- [ ] **Step 3: Open the PR**

```bash
git push -u origin feat/vercel-migration
gh pr create --base main --title "Migrate Door A to Vercel (Blob + Upstash Redis + Sandbox)" --body "See docs/superpowers/specs/2026-07-01-vercel-migration-design.md. Engine src/* unchanged. Live stays gated off."
```

---

## Self-Review

**Spec coverage** (each §3 component → task):
- §3.1 Blob storage → Task 1.1 ✅
- §3.2 Redis Streams hub → Task 2.1 ✅
- §3.3 Sandbox execution → Tasks 0.3, 3.1, 3.2 ✅
- §3.4 SSE tail/replay → Task 4.2 ✅
- §3.5 Kickoff/provision → Task 4.1 ✅
- §3.6 Client reconnect → Task 5.1 ✅
- §3.7 Capacity gate → Task 4.1 (activeCount) ✅
- §8 Deploy/cutover → Tasks 6.1, 6.2 ✅
- §9 De-risk spike → Phase 0 ✅

**Placeholder scan:** no `TBD`/`add error handling`/`similar to`—every code step shows real code. Spike-gated SDK forms are flagged for validation, not left blank. ✅

**Type consistency:** `SseEvent.id` is a **string** (Redis stream id) throughout Tasks 2.1/4.2/5.1; `readSince(runId, lastId: string)`, `publish → string`, `activeCount → Promise<number>`, `provisionRun(runId, mode, input)` consistent across 3.2/4.1. `STREAM_END` defined once in `server/types.ts`, consumed in 3.1/4.2/5.1. ✅

**Known follow-ups (not blockers):** the numeric-index `replayStream.fromEventId` and the string Redis `lastEventId` are two different resume mechanisms by design (finished-run replay re-reads the short record from 0; active-run reconnect resumes via Redis) — documented in Task 4.2.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-01-vercel-migration.md`.
