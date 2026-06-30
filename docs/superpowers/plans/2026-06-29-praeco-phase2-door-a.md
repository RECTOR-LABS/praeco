# Praeco Phase 2 — Door A (Web App) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Praeco's human web app (Door A) — Landing → Intake → live **Agent-Economy Theater** → Finished Kit → shareable Replay — fully working in **sandbox** ($0, real GLM + mock marketplace) and **replay** (persisted `RunRecord`) modes, deployed on Railway.

**Architecture:** A single Next.js (App Router, standalone) service imports the **unchanged** Phase-1 engine from `src/`. `POST /api/runs` kicks off `runLaunchJob` (not awaited) and registers it in an in-memory **run-hub**; `GET /api/runs/:id/stream` serves the hub's typed `WorklogEvent`s over **SSE** (one wire format). Replay re-emits a persisted `RunRecord.worklog` paced by its own timestamps. A pure `theaterReducer` folds events into the 3-lane "trading floor" UI. Live mode's seam exists behind `LIVE_RUN_TOKEN` but the on-chain run is deferred.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript (existing `tsconfig`, `moduleResolution: Bundler`) · Tailwind CSS 3.4 + shadcn/ui · Lucide icons · Zod 4 (already a dep) · Vitest 4 (+ `@vitejs/plugin-react`, jsdom, Testing Library) · Railway (standalone Node server + volume).

## Global Constraints

- **Engine is READ-ONLY in this plan.** Do not modify `src/engine/**`, `src/cap/{wallet,discovery,hire}.ts`, `src/llm/**`, `src/{config,constants,types}.ts`. The only `src/` change is the new `src/cap/mock.ts` (Task 2, extraction). Reuse `WorklogEvent`, `WorklogEventKind`, `RunRecord`, `RunStatus`, `LaunchKit`, `LaunchAsset`, `ProvenanceCard`, `LegKind` from `src/types.ts` verbatim.
- **Node** `>=22.19.0`. Package is `"type": "module"`.
- **Required legs** (order matters in the UI): `["research", "landing_copy", "og_image"]` (`REQUIRED_LEGS`).
- **Money:** sandbox/replay touch **no chain and no USDC**. `live` mode requires a valid `LIVE_RUN_TOKEN` and is **not exercised** in this plan.
- **Tests green before every commit:** `pnpm test:run` and `pnpm typecheck`.
- **Commits:** one logical unit each, **GPG-signed** (`-S`), **NO AI attribution** anywhere (no `Co-Authored-By`, no tool mentions).
- **Branch:** `feat/phase0-derisk`.
- **Display formatting:** dollar amounts via `baseUnitsToUsd(bigint)` from `src/constants.ts`; Basescan links from `ProvenanceCard.basescanUrl` / `HireResult.basescanPayUrl`.

---

## File Structure

**Created (web layer):**
- `next.config.mjs` — standalone output, webpack `extensionAlias` (`.js`→`.ts`), `serverExternalPackages` for the native SDKs.
- `postcss.config.mjs`, `tailwind.config.ts`, `app/globals.css` — Tailwind 3 + dark theme tokens.
- `vitest.config.ts` — React plugin + jsdom setup for `.tsx` tests; node default for engine tests.
- `lib/utils.ts` — `cn()` (shadcn).
- `components/ui/**` — shadcn primitives (button, card, input, badge, etc.).
- `components/theater/{reducer.ts,Theater.tsx,BrainBar.tsx,Lane.tsx,MoneyLedger.tsx,ThinkingFeed.tsx,useRunStream.ts}`.
- `components/KitView.tsx`.
- `server/{types.ts,run-hub.ts,persistence.ts,engine-deps.ts,replay.ts,gating.ts,start-run.ts,stream-run.ts}`.
- `app/layout.tsx`, `app/(marketing)/page.tsx`, `app/intake/page.tsx`, `app/run/[id]/page.tsx`, `app/replay/[id]/page.tsx`, `app/kit/[id]/page.tsx`.
- `app/api/runs/route.ts`, `app/api/runs/[id]/stream/route.ts`.
- `test/fixtures/run-completed.json` — deterministic, schema-accurate completed `RunRecord`.
- Colocated `*.test.ts` / `*.test.tsx`.

**Modified:**
- `package.json` — web deps + scripts.
- `tsconfig.json` — add jsx/dom/paths/next-plugin while keeping `moduleResolution: Bundler` (engine still type-checks).
- `scripts/run-job.ts` — import the extracted mock.
- `.gitignore` — add `.next/`, `/data/`.
- `src/cap/mock.ts` — extracted mock marketplace (the only engine-dir addition).

**Natural checkpoints:** Tasks 1–9 = transport core (curl-able API). Tasks 10–13 = UI. Task 14 = deploy.

---

## Task 1: Scaffold Next.js + Tailwind + Vitest-React, prove engine import resolves

**Files:**
- Create: `next.config.mjs`, `postcss.config.mjs`, `tailwind.config.ts`, `app/globals.css`, `app/layout.tsx`, `app/(marketing)/page.tsx`, `lib/utils.ts`, `vitest.config.ts`, `test/setup.ts`
- Modify: `package.json`, `tsconfig.json`, `.gitignore`
- Test: `app/(marketing)/page.test.tsx`

**Interfaces:**
- Produces: a running Next app; `cn(...)` from `lib/utils`; a vitest setup that transforms `.tsx` and provides jest-dom matchers; proof that `import type { WorklogEvent } from "@/src/types"` type-checks.

- [ ] **Step 1: Add dependencies**

```bash
pnpm add next@^15 react@^19 react-dom@^19 lucide-react clsx tailwind-merge class-variance-authority
pnpm add -D @types/react @types/react-dom @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event tailwindcss@^3.4 postcss autoprefixer
```

- [ ] **Step 2: `next.config.mjs` — standalone + resolve engine `.js` imports + keep SDKs external**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Engine source uses NodeNext-style ".js" import specifiers that point at ".ts"
  // files. Teach webpack to resolve them, and keep the native/server SDKs out of
  // the bundle (they must run in Node, never the client).
  serverExternalPackages: [
    "@croo-network/sdk",
    "@earendil-works/pi-ai",
    "@earendil-works/pi-agent-core",
  ],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};
export default nextConfig;
```

- [ ] **Step 3: Tailwind + PostCSS + globals (dark theme)**

`tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss";
export default {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        lane: { research: "#58a6ff", copy: "#e3b341", image: "#c297ff", money: "#3fb950" },
      },
    },
  },
  plugins: [],
} satisfies Config;
```

`postcss.config.mjs`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
:root { color-scheme: dark; }
body { @apply bg-[#0d1117] text-[#e6edf3] antialiased; }
```

- [ ] **Step 4: `lib/utils.ts`, root layout, landing placeholder**

`lib/utils.ts`:
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

`app/layout.tsx`:
```tsx
import "./globals.css";
import type { ReactNode } from "react";
export const metadata = { title: "Praeco", description: "A general contractor for product launches." };
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
```

`app/(marketing)/page.tsx`:
```tsx
import type { WorklogEvent } from "@/src/types"; // proves engine import resolves
export default function Landing() {
  const sample: WorklogEvent["kind"] = "run_started";
  return <main className="p-10"><h1 className="text-2xl font-bold">Praeco</h1><p className="sr-only">{sample}</p></main>;
}
```

- [ ] **Step 5: `tsconfig.json` — support Next without breaking the engine**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": false,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "allowJs": true,
    "incremental": true,
    "noEmit": true,
    "types": ["node"],
    "paths": { "@/*": ["./*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["src", "scripts", "app", "components", "server", "lib", "test", "next-env.d.ts", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```
Note: `outDir`/`dist` is no longer needed (Next builds to `.next`); `noEmit` is set since `typecheck` is `tsc --noEmit` already.

- [ ] **Step 6: `vitest.config.ts` + `test/setup.ts`**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node", // engine tests; .tsx tests opt in via `// @vitest-environment jsdom`
    setupFiles: ["./test/setup.ts"],
    globals: true,
    include: ["src/**/*.test.ts", "server/**/*.test.ts", "components/**/*.test.{ts,tsx}", "app/**/*.test.{ts,tsx}", "test/**/*.test.ts"],
  },
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname } },
});
```
`test/setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 7: `package.json` scripts + `.gitignore`**

Add to `scripts`: `"dev:web": "next dev", "build": "next build", "start": "node .next/standalone/server.js"`. Keep `test`, `test:run`, `typecheck`, `engine:*` unchanged. Add to `.gitignore`: `.next/` and `/data/`.

- [ ] **Step 8: Write the failing component test**

`app/(marketing)/page.test.tsx`:
```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import Landing from "./page";
test("landing renders the brand", () => {
  render(<Landing />);
  expect(screen.getByRole("heading", { name: "Praeco" })).toBeInTheDocument();
});
```

- [ ] **Step 9: Run it — expect pass, and typecheck clean**

Run: `pnpm test:run app/(marketing)/page.test.tsx` → PASS. Run: `pnpm typecheck` → no errors (proves `@/src/types` import + merged tsconfig). Run: `pnpm exec next build` → standalone build succeeds.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -S -m "feat(web): scaffold Next.js 15 + Tailwind + vitest-react, engine import proven"
```

---

## Task 2: Extract the mock marketplace into `src/cap/mock.ts` (DRY)

**Files:**
- Create: `src/cap/mock.ts`, `src/cap/mock.test.ts`
- Modify: `scripts/run-job.ts` (import the extraction)

**Interfaces:**
- Produces: `export function mockFetch(): FetchFn` and `export function mockClient(): CapBuyer` — the exact mock from `scripts/run-job.ts` today (3 services: `mock-research`/`mock-copy`/`mock-image`, percent `completionRate`, JSON-string `requirementSchema`, `created` order state, keyed deliverables). Consumed by `scripts/run-job.ts` and `server/engine-deps.ts` (Task 5).

- [ ] **Step 1: Write the failing test**

`src/cap/mock.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mockFetch, mockClient } from "./mock.js";

describe("mock marketplace", () => {
  it("serves the services catalog page 1", async () => {
    const f = mockFetch();
    const res = await f("https://x/public/services?page=1" as any);
    const body = await res.json();
    expect(body.items.map((s: any) => s.serviceId)).toEqual(["mock-research", "mock-copy", "mock-image"]);
  });
  it("delivers keyed content per serviceId via negotiate→getDelivery", async () => {
    const c = mockClient();
    await c.negotiateOrder({ serviceId: "mock-copy" } as any);
    const [order] = await c.listOrders({} as any);
    const d = await c.getDelivery(order.orderId);
    expect(d.deliverableText).toContain("Headline: Streaky");
    expect(d.contentHash).toMatch(/^0xmockhash/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:run src/cap/mock.test.ts` → FAIL (`./mock.js` not found).

- [ ] **Step 3: Create `src/cap/mock.ts`**

Move the `mockFetch()` and `mockClient()` function bodies **verbatim** out of `scripts/run-job.ts` into `src/cap/mock.ts`. Add the imports they need at the top:
```ts
import type { CapBuyer } from "./hire.js";
import type { FetchFn } from "./wallet.js";
// ...then paste mockFetch() and mockClient() exactly as they exist in scripts/run-job.ts, exported.
```

- [ ] **Step 4: Update `scripts/run-job.ts` to import them**

Remove the two inline functions; add `import { mockFetch, mockClient } from "../src/cap/mock.js";`.

- [ ] **Step 5: Run tests + the existing smoke compiles**

Run: `pnpm test:run src/cap/mock.test.ts` → PASS. Run: `pnpm typecheck` → clean. (Do **not** run `engine:smoke` here — it spends GLM tokens; typecheck proves the wiring.)

- [ ] **Step 6: Commit**

```bash
git add src/cap/mock.ts src/cap/mock.test.ts scripts/run-job.ts
git commit -S -m "refactor(cap): extract mock marketplace into src/cap/mock.ts for reuse"
```

---

## Task 3: `server/types.ts` + `server/persistence.ts` (RunRecord ⇄ RUNS_DIR)

**Files:**
- Create: `server/types.ts`, `server/persistence.ts`, `server/persistence.test.ts`

**Interfaces:**
- Produces:
  - `server/types.ts`: `export type RunMode = "replay" | "sandbox" | "live";` · `export interface SseEvent { id: number; event: WorklogEventKind; data: WorklogEvent }` · `export interface StartRunRequest { mode: RunMode; text?: string; repoUrl?: string }` · `export interface StartRunResponse { runId: string }`.
  - `server/persistence.ts`: `runsDir(): string` (env `RUNS_DIR` || `./runs`) · `saveRecord(rec: RunRecord): Promise<void>` · `loadRecord(runId: string): Promise<RunRecord | null>` · `listRecords(): Promise<RunRecord[]>` (newest first).

- [ ] **Step 1: Write the failing test**

`server/persistence.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunRecord } from "@/src/types";
import { saveRecord, loadRecord } from "./persistence.js";

const rec: RunRecord = {
  runId: "run-test-1", status: "completed", brief: { product: "P", audience: "A", features: [], tone: "T", oneLiner: "O" },
  assets: [], worklog: [{ kind: "run_started", at: 1, message: "x" }], spentBaseUnits: "0", startedAt: 1, endedAt: 2,
};
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "praeco-")); process.env.RUNS_DIR = dir; });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); delete process.env.RUNS_DIR; });

it("round-trips a RunRecord", async () => {
  await saveRecord(rec);
  expect(await loadRecord("run-test-1")).toEqual(rec);
});
it("returns null for a missing id", async () => {
  expect(await loadRecord("nope")).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:run server/persistence.test.ts` → FAIL.

- [ ] **Step 3: Implement `server/types.ts`**

```ts
import type { WorklogEvent, WorklogEventKind } from "@/src/types";
export type RunMode = "replay" | "sandbox" | "live";
export interface SseEvent { id: number; event: WorklogEventKind; data: WorklogEvent; }
export interface StartRunRequest { mode: RunMode; text?: string; repoUrl?: string; }
export interface StartRunResponse { runId: string; }
```

- [ ] **Step 4: Implement `server/persistence.ts`**

```ts
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { RunRecord } from "@/src/types";

export function runsDir(): string { return process.env.RUNS_DIR ?? "./runs"; }

export async function saveRecord(rec: RunRecord): Promise<void> {
  await mkdir(runsDir(), { recursive: true });
  await writeFile(join(runsDir(), `${rec.runId}.json`), JSON.stringify(rec, null, 2), "utf8");
}
export async function loadRecord(runId: string): Promise<RunRecord | null> {
  // Guard against path traversal: only a bare runId is addressable.
  if (!/^[\w.-]+$/.test(runId)) return null;
  try { return JSON.parse(await readFile(join(runsDir(), `${runId}.json`), "utf8")) as RunRecord; }
  catch { return null; }
}
export async function listRecords(): Promise<RunRecord[]> {
  let names: string[] = [];
  try { names = (await readdir(runsDir())).filter((n) => n.endsWith(".json")); } catch { return []; }
  const recs = await Promise.all(names.map((n) => loadRecord(n.replace(/\.json$/, ""))));
  return recs.filter((r): r is RunRecord => r !== null).sort((a, b) => b.startedAt - a.startedAt);
}
```

- [ ] **Step 5: Run → pass; commit**

Run: `pnpm test:run server/persistence.test.ts` → PASS.
```bash
git add server/types.ts server/persistence.ts server/persistence.test.ts
git commit -S -m "feat(web): server types + RunRecord persistence to RUNS_DIR"
```

---

## Task 4: `server/run-hub.ts` — in-memory buffer + fan-out + Last-Event-ID

**Files:**
- Create: `server/run-hub.ts`, `server/run-hub.test.ts`

**Interfaces:**
- Produces a `RunHub` singleton:
  - `create(runId: string, mode: RunMode): ActiveRun`
  - `get(runId: string): ActiveRun | undefined`
  - `publish(runId: string, e: WorklogEvent): void` — assigns monotonic `id`, buffers, fans out.
  - `finish(runId: string, record: RunRecord): Promise<void>` — marks done, persists.
  - `subscribe(runId, fromEventId, fn): () => void` — replays buffered events with `id > fromEventId`, then streams live; returns unsubscribe.
  - `ActiveRun = { runId; mode; status: "running"|"done"|"error"; buffer: SseEvent[]; record?: RunRecord }`.

- [ ] **Step 1: Write the failing test**

`server/run-hub.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
import type { RunRecord, WorklogEvent } from "@/src/types";
import { RunHub } from "./run-hub.js";

const ev = (kind: WorklogEvent["kind"], message = ""): WorklogEvent => ({ kind, at: 1, message });
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "praeco-")); process.env.RUNS_DIR = dir; });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); delete process.env.RUNS_DIR; });

it("assigns monotonic ids and fans out live", () => {
  const hub = new RunHub(); hub.create("r1", "sandbox");
  const seen: number[] = [];
  hub.subscribe("r1", 0, (e) => seen.push(e.id));
  hub.publish("r1", ev("run_started")); hub.publish("r1", ev("intake_done"));
  expect(seen).toEqual([1, 2]);
});
it("replays buffered events with id > lastEventId on subscribe", () => {
  const hub = new RunHub(); hub.create("r1", "sandbox");
  hub.publish("r1", ev("run_started")); hub.publish("r1", ev("intake_done"));
  const seen: number[] = [];
  hub.subscribe("r1", 1, (e) => seen.push(e.id)); // resume after id 1
  expect(seen).toEqual([2]);
});
it("finish marks done and persists", async () => {
  const hub = new RunHub(); hub.create("r1", "sandbox");
  const rec: RunRecord = { runId: "r1", status: "completed", brief: { product: "P", audience: "A", features: [], tone: "T", oneLiner: "O" }, assets: [], worklog: [], spentBaseUnits: "0", startedAt: 1, endedAt: 2 };
  await hub.finish("r1", rec);
  expect(hub.get("r1")!.status).toBe("done");
});
```

- [ ] **Step 2: Run → FAIL.** `pnpm test:run server/run-hub.test.ts`

- [ ] **Step 3: Implement `server/run-hub.ts`**

```ts
import type { RunRecord, WorklogEvent } from "@/src/types";
import type { RunMode, SseEvent } from "./types.js";
import { saveRecord } from "./persistence.js";

export interface ActiveRun {
  runId: string; mode: RunMode; status: "running" | "done" | "error";
  buffer: SseEvent[]; record?: RunRecord; subscribers: Set<(e: SseEvent) => void>; nextId: number;
}

export class RunHub {
  private runs = new Map<string, ActiveRun>();
  create(runId: string, mode: RunMode): ActiveRun {
    const r: ActiveRun = { runId, mode, status: "running", buffer: [], subscribers: new Set(), nextId: 0 };
    this.runs.set(runId, r); return r;
  }
  get(runId: string): ActiveRun | undefined { return this.runs.get(runId); }
  publish(runId: string, data: WorklogEvent): void {
    const r = this.runs.get(runId); if (!r) return;
    const e: SseEvent = { id: ++r.nextId, event: data.kind, data };
    r.buffer.push(e);
    for (const fn of r.subscribers) fn(e);
  }
  async finish(runId: string, record: RunRecord): Promise<void> {
    const r = this.runs.get(runId); if (!r) return;
    r.record = record; r.status = "done";
    await saveRecord(record);
  }
  fail(runId: string): void { const r = this.runs.get(runId); if (r) r.status = "error"; }
  subscribe(runId: string, fromEventId: number, fn: (e: SseEvent) => void): () => void {
    const r = this.runs.get(runId); if (!r) return () => {};
    for (const e of r.buffer) if (e.id > fromEventId) fn(e); // catch-up
    r.subscribers.add(fn);
    return () => r.subscribers.delete(fn);
  }
}

// Process-wide singleton (survives across requests on Railway's long-lived Node server).
const g = globalThis as unknown as { __praecoHub?: RunHub };
export const hub: RunHub = g.__praecoHub ?? (g.__praecoHub = new RunHub());
```

- [ ] **Step 4: Run → PASS.** `pnpm test:run server/run-hub.test.ts`

- [ ] **Step 5: Commit**
```bash
git add server/run-hub.ts server/run-hub.test.ts
git commit -S -m "feat(web): in-memory run-hub with buffer, fan-out, Last-Event-ID resume"
```

---

## Task 5: `server/engine-deps.ts` — build sandbox & live deps

**Files:**
- Create: `server/engine-deps.ts`, `server/engine-deps.test.ts`

**Interfaces:**
- Consumes: `loadConfig` (`src/config.ts`), `createGlmModels`/`createLlm` (`src/llm/*`), `mockClient`/`mockFetch` (`src/cap/mock.ts`), `AgentClient` (`@croo-network/sdk`), `runLaunchJob`'s `RunDeps` shape (`src/engine/run.ts`).
- Produces: `buildSandboxDeps(onEvent, runId): RunDeps` (mock client + mock fetch, real GLM, pins cleared) · `buildLiveDeps(onEvent, runId): Promise<{ deps: RunDeps; close: () => void }>` (real `AgentClient` w/ WS connected, real fetch, LIVE hirePollOpts). Both omit nothing `runLaunchJob` requires.

- [ ] **Step 1: Write the failing test** (wiring only — never invokes GLM)

`server/engine-deps.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { buildSandboxDeps } from "./engine-deps.js";

beforeEach(() => {
  // Minimal env so loadConfig() passes (values unused by the mock path).
  Object.assign(process.env, {
    CROO_API_URL: "http://x", CROO_WS_URL: "ws://x", CROO_SDK_KEY: "k", BASE_RPC_URL: "http://x",
    OLLAMA_API_KEY: "k", OLLAMA_BASE_URL: "http://x", PRAECO_AGENT_ID: "a", PRAECO_AGENT_WALLET: "0xabc",
    SVC_RESEARCH: "real-pin", // must be cleared by sandbox
  });
});
it("sandbox deps use the mock client and clear live SVC_* pins", () => {
  const events: string[] = [];
  const deps = buildSandboxDeps((e) => events.push(e.kind), "run-x");
  expect(typeof deps.client.negotiateOrder).toBe("function");
  expect(deps.config.preferredServiceIds).toEqual({}); // pins cleared for the mock catalog
  expect(deps.onEvent).toBeTypeOf("function");
});
```

- [ ] **Step 2: Run → FAIL.** `pnpm test:run server/engine-deps.test.ts`

- [ ] **Step 3: Implement `server/engine-deps.ts`**

```ts
import { AgentClient } from "@croo-network/sdk";
import { loadConfig } from "@/src/config";
import { createGlmModels } from "@/src/llm/model";
import { createLlm } from "@/src/llm/llm";
import { mockClient, mockFetch } from "@/src/cap/mock";
import type { RunDeps } from "@/src/engine/run";
import type { CapBuyer } from "@/src/cap/hire";
import type { FetchFn } from "@/src/cap/wallet";
import type { WorklogEvent } from "@/src/types";

function glm() {
  const { models, model, streamFn } = createGlmModels();
  const llm = createLlm({ complete: (m, c) => models.complete(m, c) }, model);
  return { model, streamFn, llm };
}

export function buildSandboxDeps(onEvent: (e: WorklogEvent) => void, runId: string): RunDeps {
  const config = loadConfig();
  config.preferredServiceIds = {}; // mock catalog has no real SVC_* ids → clear pins (fail-closed otherwise)
  const { model, streamFn, llm } = glm();
  return { config, llm, client: mockClient(), model, streamFn, fetchImpl: mockFetch(), onEvent, runId };
}

export async function buildLiveDeps(onEvent: (e: WorklogEvent) => void, runId: string): Promise<{ deps: RunDeps; close: () => void }> {
  const config = loadConfig();
  const live = new AgentClient({ baseURL: config.crooApiUrl, wsURL: config.crooWsUrl, rpcURL: config.baseRpcUrl }, config.crooSdkKey);
  await live.connectWebSocket();
  const { model, streamFn, llm } = glm();
  const deps: RunDeps = {
    config, llm, client: live as unknown as CapBuyer, model, streamFn, fetchImpl: fetch as FetchFn, onEvent, runId,
    hirePollOpts: { negotiationPolls: 80, negotiationDelayMs: 2000, deliveryPolls: 120, deliveryDelayMs: 5000 },
  };
  return { deps, close: () => (live as unknown as { close?: () => void }).close?.() };
}
```

- [ ] **Step 4: Run → PASS.** `pnpm test:run server/engine-deps.test.ts`

- [ ] **Step 5: Commit**
```bash
git add server/engine-deps.ts server/engine-deps.test.ts
git commit -S -m "feat(web): build sandbox (mock) and live (CAP) engine deps"
```

---

## Task 6: `server/replay.ts` — paced replay of a persisted RunRecord

**Files:**
- Create: `server/replay.ts`, `server/replay.test.ts`

**Interfaces:**
- Produces: `replayDelays(worklog: WorklogEvent[], speed: "1"|"4"|"max"): number[]` (pure; per-event delay clamped to `[120,1500]`ms, divided by 4 for `"4"`, `0` for `"max"`; first event delay `0`) · `async function* replayStream(rec: RunRecord, speed, sleep?): AsyncGenerator<SseEvent>` (yields `{id,event,data}` with `id` starting at 1, awaiting `sleep(delay)` between events).

- [ ] **Step 1: Write the failing test**

`server/replay.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type { RunRecord, WorklogEvent } from "@/src/types";
import { replayDelays, replayStream } from "./replay.js";

const wl: WorklogEvent[] = [
  { kind: "run_started", at: 1000, message: "a" },
  { kind: "intake_done", at: 1050, message: "b" },   // +50ms -> clamp up to 120
  { kind: "hire_paid", at: 9000, message: "c" },       // +7950ms -> clamp down to 1500
];
it("clamps per-event delays to [120,1500] and zeroes the first", () => {
  expect(replayDelays(wl, "1")).toEqual([0, 120, 1500]);
});
it("speed=4 quarters the delays; max zeroes them", () => {
  expect(replayDelays(wl, "4")).toEqual([0, 30, 375]);
  expect(replayDelays(wl, "max")).toEqual([0, 0, 0]);
});
it("replayStream yields monotonic ids in order", async () => {
  const rec = { worklog: wl } as RunRecord;
  const ids: number[] = []; const kinds: string[] = [];
  for await (const e of replayStream(rec, "max", async () => {})) { ids.push(e.id); kinds.push(e.event); }
  expect(ids).toEqual([1, 2, 3]);
  expect(kinds).toEqual(["run_started", "intake_done", "hire_paid"]);
});
```

- [ ] **Step 2: Run → FAIL.** `pnpm test:run server/replay.test.ts`

- [ ] **Step 3: Implement `server/replay.ts`**

```ts
import type { RunRecord, WorklogEvent } from "@/src/types";
import type { SseEvent } from "./types.js";

const MIN = 120, MAX = 1500;
export function replayDelays(worklog: WorklogEvent[], speed: "1" | "4" | "max"): number[] {
  return worklog.map((e, i) => {
    if (i === 0) return 0;
    if (speed === "max") return 0;
    const raw = e.at - worklog[i - 1].at;
    const clamped = Math.min(MAX, Math.max(MIN, raw));
    return speed === "4" ? Math.round(clamped / 4) : clamped;
  });
}
export async function* replayStream(
  rec: RunRecord, speed: "1" | "4" | "max", sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): AsyncGenerator<SseEvent> {
  const delays = replayDelays(rec.worklog, speed);
  for (let i = 0; i < rec.worklog.length; i++) {
    if (delays[i] > 0) await sleep(delays[i]);
    const data = rec.worklog[i];
    yield { id: i + 1, event: data.kind, data };
  }
}
```

- [ ] **Step 4: Run → PASS.** `pnpm test:run server/replay.test.ts`

- [ ] **Step 5: Commit**
```bash
git add server/replay.ts server/replay.test.ts
git commit -S -m "feat(web): paced replay stream from a persisted RunRecord"
```

---

## Task 7: `server/gating.ts` — zod validation + token + concurrency

**Files:**
- Create: `server/gating.ts`, `server/gating.test.ts`

**Interfaces:**
- Produces: `parseStartRequest(body: unknown): StartRunRequest` (throws `GateError` w/ `status` on bad input) · `assertLiveAllowed(headers: Headers): void` (throws 403 unless `Authorization: Bearer <LIVE_RUN_TOKEN>`) · `assertCapacity(hub, mode): void` (throws 429 if > caps: 1 live, 3 sandbox concurrent) · `class GateError extends Error { status: number }`.

- [ ] **Step 1: Write the failing test**

`server/gating.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseStartRequest, assertLiveAllowed, GateError } from "./gating.js";

it("accepts a one-liner sandbox request", () => {
  expect(parseStartRequest({ mode: "sandbox", text: "A privacy-first tracker" })).toEqual({ mode: "sandbox", text: "A privacy-first tracker" });
});
it("accepts a github repo url", () => {
  expect(parseStartRequest({ mode: "sandbox", repoUrl: "https://github.com/a/b" }).repoUrl).toBe("https://github.com/a/b");
});
it("rejects a non-github url", () => {
  expect(() => parseStartRequest({ mode: "sandbox", repoUrl: "https://evil.com/a/b" })).toThrow(GateError);
});
it("rejects empty input", () => {
  expect(() => parseStartRequest({ mode: "sandbox" })).toThrow(/text or repoUrl/);
});
it("403s a live request without the token", () => {
  process.env.LIVE_RUN_TOKEN = "secret";
  expect(() => assertLiveAllowed(new Headers())).toThrow(GateError);
  expect(() => assertLiveAllowed(new Headers({ Authorization: "Bearer secret" }))).not.toThrow();
});
```

- [ ] **Step 2: Run → FAIL.** `pnpm test:run server/gating.test.ts`

- [ ] **Step 3: Implement `server/gating.ts`**

```ts
import { z } from "zod";
import type { StartRunRequest, RunMode } from "./types.js";
import type { RunHub } from "./run-hub.js";

export class GateError extends Error { constructor(message: string, readonly status: number) { super(message); } }

const schema = z.object({
  mode: z.enum(["replay", "sandbox", "live"]),
  text: z.string().min(3).max(2000).optional(),
  repoUrl: z.string().regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/, "must be a https://github.com/owner/repo URL").optional(),
}).refine((v) => v.text || v.repoUrl, { message: "provide text or repoUrl" });

export function parseStartRequest(body: unknown): StartRunRequest {
  const r = schema.safeParse(body);
  if (!r.success) throw new GateError(r.error.issues[0]?.message ?? "invalid request", 400);
  return r.data;
}
export function assertLiveAllowed(headers: Headers): void {
  const token = process.env.LIVE_RUN_TOKEN;
  if (!token) throw new GateError("live runs are disabled", 403);
  if (headers.get("authorization") !== `Bearer ${token}`) throw new GateError("forbidden", 403);
}
const CAPS: Record<RunMode, number> = { live: 1, sandbox: 3, replay: 999 };
export function assertCapacity(activeCount: number, mode: RunMode): void {
  if (activeCount >= CAPS[mode]) throw new GateError(`too many concurrent ${mode} runs`, 429);
}
```

- [ ] **Step 4: Run → PASS.** `pnpm test:run server/gating.test.ts`

- [ ] **Step 5: Commit**
```bash
git add server/gating.ts server/gating.test.ts
git commit -S -m "feat(web): request gating — zod validation, live token, concurrency caps"
```

---

## Task 8: `server/start-run.ts` + `POST /api/runs`

**Files:**
- Create: `server/start-run.ts`, `server/start-run.test.ts`, `app/api/runs/route.ts`

**Interfaces:**
- Consumes: `hub` (Task 4), gating (Task 7), `buildSandboxDeps`/`buildLiveDeps` (Task 5), `runLaunchJob` (`src/engine/run.ts`), `buildBrief`'s `IntakeInput` (`src/engine/intake.ts`: `{ text } | { repoUrl }`).
- Produces: `startRun(req: StartRunRequest, headers: Headers, opts?: { runner?: Runner }): Promise<StartRunResponse>` where `type Runner = (runId, mode, input, onEvent) => Promise<RunRecord>`. Default runner calls `runLaunchJob` with sandbox/live deps and is **not awaited by the caller** (fire-and-forget into the hub). `now()`-free `runId` via a counter+startedAt is fine; reuse the engine's default (`run-${Date.now()}`).

- [ ] **Step 1: Write the failing test** (injects a fake runner — no GLM)

`server/start-run.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
import type { RunRecord } from "@/src/types";
import { startRun } from "./start-run.js";
import { hub } from "./run-hub.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "praeco-")); process.env.RUNS_DIR = dir; });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

it("sandbox start registers a run and publishes events", async () => {
  const fakeRunner = async (runId: string, _m: any, _i: any, onEvent: (e: any) => void): Promise<RunRecord> => {
    onEvent({ kind: "run_started", at: 1, message: "x" });
    return { runId, status: "completed", brief: { product: "P", audience: "A", features: [], tone: "T", oneLiner: "O" }, assets: [], worklog: [{ kind: "run_started", at: 1, message: "x" }], spentBaseUnits: "0", startedAt: 1, endedAt: 2 };
  };
  const { runId } = await startRun({ mode: "sandbox", text: "hello world" }, new Headers(), { runner: fakeRunner });
  await new Promise((r) => setTimeout(r, 10)); // let the fire-and-forget settle
  const run = hub.get(runId)!;
  expect(run.mode).toBe("sandbox");
  expect(run.buffer[0]?.event).toBe("run_started");
});
it("rejects a live start without the token", async () => {
  delete process.env.LIVE_RUN_TOKEN;
  await expect(startRun({ mode: "live", text: "hi there" }, new Headers())).rejects.toMatchObject({ status: 403 });
});
```

- [ ] **Step 2: Run → FAIL.** `pnpm test:run server/start-run.test.ts`

- [ ] **Step 3: Implement `server/start-run.ts`**

```ts
import type { RunRecord, WorklogEvent } from "@/src/types";
import type { IntakeInput } from "@/src/engine/intake";
import { runLaunchJob } from "@/src/engine/run";
import type { StartRunRequest, StartRunResponse, RunMode } from "./types.js";
import { hub } from "./run-hub.js";
import { assertLiveAllowed, assertCapacity } from "./gating.js";
import { buildSandboxDeps, buildLiveDeps } from "./engine-deps.js";

export type Runner = (runId: string, mode: RunMode, input: IntakeInput, onEvent: (e: WorklogEvent) => void) => Promise<RunRecord>;

const defaultRunner: Runner = async (runId, mode, input, onEvent) => {
  if (mode === "live") {
    const { deps, close } = await buildLiveDeps(onEvent, runId);
    try { return await runLaunchJob(input, deps); } finally { close(); }
  }
  return runLaunchJob(input, buildSandboxDeps(onEvent, runId));
};

let counter = 0;
export async function startRun(req: StartRunRequest, headers: Headers, opts: { runner?: Runner } = {}): Promise<StartRunResponse> {
  if (req.mode === "live") assertLiveAllowed(headers);
  const active = [...hubActive()].filter((r) => r.mode === req.mode && r.status === "running").length;
  assertCapacity(active, req.mode);

  const runId = `run-${++counter}-${req.mode}-${Math.abs(hashCode(JSON.stringify(req)))}`;
  hub.create(runId, req.mode);
  const input: IntakeInput = req.repoUrl ? { repoUrl: req.repoUrl } : { text: req.text! };
  const runner = opts.runner ?? defaultRunner;

  // Fire-and-forget: the run continues in this long-lived Node process; SSE reads the hub.
  void runner(runId, req.mode, input, (e) => hub.publish(runId, e))
    .then((rec) => hub.finish(runId, rec))
    .catch((err) => { hub.publish(runId, { kind: "error", at: Date.now(), message: `run failed: ${(err as Error).message}` }); hub.fail(runId); });

  return { runId };
}

function* hubActive() { /* expose active runs without leaking the map */ const h = hub as unknown as { runs: Map<string, any> }; yield* h.runs.values(); }
function hashCode(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0; return h; }
```
Note: add `activeCount(mode)` to `RunHub` instead of the `hubActive()` reach-in if you prefer — either is fine; if you add the method, update Task 4's interface list.

- [ ] **Step 4: Implement `app/api/runs/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { parseStartRequest, GateError } from "@/server/gating";
import { startRun } from "@/server/start-run";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = parseStartRequest(await req.json());
    const res = await startRun(body, req.headers);
    return NextResponse.json(res);
  } catch (e) {
    if (e instanceof GateError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run → PASS; typecheck; commit**

Run: `pnpm test:run server/start-run.test.ts` → PASS. `pnpm typecheck` → clean.
```bash
git add server/start-run.ts server/start-run.test.ts app/api/runs/route.ts
git commit -S -m "feat(web): POST /api/runs — start sandbox/live runs into the hub"
```

---

## Task 9: `server/stream-run.ts` + `GET /api/runs/[id]/stream` (SSE)

**Files:**
- Create: `server/stream-run.ts`, `server/stream-run.test.ts`, `app/api/runs/[id]/stream/route.ts`

**Interfaces:**
- Consumes: `hub` (live), `loadRecord` + `replayStream` (replay).
- Produces: `sseFrame(e: SseEvent): string` (`id: N\nevent: K\ndata: {…}\n\n`) · `streamRun(runId, { lastEventId, speed }): ReadableStream<Uint8Array>` — if the hub has the run, subscribe (catch-up from `lastEventId` + live, close on terminal `run_completed`/`run_aborted`/`error`); else load the record and replay; else a one-line `error` frame then close.

- [ ] **Step 1: Write the failing test**

`server/stream-run.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
import type { RunRecord } from "@/src/types";
import { saveRecord } from "./persistence.js";
import { sseFrame, streamRun } from "./stream-run.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "praeco-")); process.env.RUNS_DIR = dir; });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

it("frames an SSE event", () => {
  expect(sseFrame({ id: 2, event: "hire_paid", data: { kind: "hire_paid", at: 1, message: "m" } }))
    .toBe(`id: 2\nevent: hire_paid\ndata: ${JSON.stringify({ kind: "hire_paid", at: 1, message: "m" })}\n\n`);
});
it("replays a persisted record over SSE then closes", async () => {
  const rec: RunRecord = { runId: "r9", status: "completed", brief: { product: "P", audience: "A", features: [], tone: "T", oneLiner: "O" }, assets: [], worklog: [{ kind: "run_started", at: 1, message: "a" }, { kind: "run_completed", at: 2, message: "b" }], spentBaseUnits: "0", startedAt: 1, endedAt: 2 };
  await saveRecord(rec);
  const text = await new Response(streamRun("r9", { speed: "max" })).text();
  expect(text).toContain("event: run_started");
  expect(text).toContain("event: run_completed");
});
```

- [ ] **Step 2: Run → FAIL.** `pnpm test:run server/stream-run.test.ts`

- [ ] **Step 3: Implement `server/stream-run.ts`**

```ts
import type { SseEvent } from "./types.js";
import type { WorklogEventKind } from "@/src/types";
import { hub } from "./run-hub.js";
import { loadRecord } from "./persistence.js";
import { replayStream } from "./replay.js";

const TERMINAL: WorklogEventKind[] = ["run_completed", "run_aborted"];
export function sseFrame(e: SseEvent): string {
  return `id: ${e.id}\nevent: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
}
export function streamRun(runId: string, opts: { lastEventId?: number; speed?: "1" | "4" | "max" }): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const active = hub.get(runId);
  if (active) {
    let unsub = () => {};
    return new ReadableStream({
      start(controller) {
        const onEvent = (e: SseEvent) => {
          controller.enqueue(enc.encode(sseFrame(e)));
          if (TERMINAL.includes(e.event)) { unsub(); try { controller.close(); } catch {} }
        };
        unsub = hub.subscribe(runId, opts.lastEventId ?? 0, onEvent);
        // If the run already finished before subscribe, the buffer flush above will have closed it.
        if (active.status !== "running") { unsub(); try { controller.close(); } catch {} }
      },
      cancel() { unsub(); },
    });
  }
  // No active run → replay from disk (or emit a single error frame).
  return new ReadableStream({
    async start(controller) {
      const rec = await loadRecord(runId);
      if (!rec) {
        controller.enqueue(enc.encode(sseFrame({ id: 1, event: "error", data: { kind: "error", at: Date.now(), message: `no run ${runId}` } })));
        controller.close(); return;
      }
      for await (const e of replayStream(rec, opts.speed ?? "1")) controller.enqueue(enc.encode(sseFrame(e)));
      controller.close();
    },
  });
}
```

- [ ] **Step 4: Implement `app/api/runs/[id]/stream/route.ts`**

```ts
import type { NextRequest } from "next/server";
import { streamRun } from "@/server/stream-run";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const speedParam = url.searchParams.get("speed");
  const speed = speedParam === "4" || speedParam === "max" ? speedParam : "1";
  const lastId = Number(req.headers.get("last-event-id") ?? url.searchParams.get("lastEventId") ?? 0) || 0;
  return new Response(streamRun(id, { lastEventId: lastId, speed }), {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
  });
}
```

- [ ] **Step 5: Run → PASS; typecheck; commit**
```bash
git add server/stream-run.ts server/stream-run.test.ts "app/api/runs/[id]/stream/route.ts"
git commit -S -m "feat(web): GET /api/runs/:id/stream — SSE for live runs and replay"
```

---

## Task 10: `components/theater/reducer.ts` — pure `theaterReducer`

**Files:**
- Create: `components/theater/reducer.ts`, `components/theater/reducer.test.ts`, `test/fixtures/run-completed.json`

**Interfaces:**
- Produces:
  - `interface LaneState { leg: LegKind; phase: "idle"|"searching"|"candidate"|"negotiating"|"ordered"|"paid"|"delivered"|"accepted"|"blocked"; agentName?: string; amountUsd?: string; basescanUrl?: string; note?: string }`
  - `interface LedgerEntry { agentName: string; amountUsd: string; basescanUrl: string }`
  - `interface TheaterState { status: "running"|"completed"|"partial"|"aborted"|"failed"; lanes: Record<LegKind, LaneState>; ledger: LedgerEntry[]; thinking: string[]; spentUsd: string; product?: string; startedAt?: number; endedAt?: number }`
  - `initialTheaterState(): TheaterState` · `theaterReducer(s: TheaterState, e: WorklogEvent): TheaterState` (pure, immutable).
- The reducer maps event kinds → lane phase per the spec §6 stage rail. **Money is assembled across events** (verified against real `runs/*.json`, NOT guessed): `agentName` parsed from the `hire_negotiating` message (`"negotiating <Agent> (<svcId>)"`), `amountUsd` from `hire_order_created.data.price` (base units → `baseUnitsToUsd`), `basescanUrl` built from `hire_paid.data.payTxHash`. A ledger entry is pushed on `hire_paid` once all three are known; the spend meter sums ledger amounts. The QA verdict word lives in the **message** (`"QA accept|redo|swap: …"`), not `data` (`data` is `{ score }`).

- [ ] **Step 1: Author the deterministic fixture** `test/fixtures/run-completed.json`

A compact, schema-accurate **completed** `RunRecord` — a clean 3/3 (every leg accepted first try) so the test is deterministic. **Every event `data` shape below is copied from real `runs/*.json` (verified), not guessed.** Worklog order:
1. `run_started` — `{kind,at,message}`
2. `intake_done` — `data:{oneLiner}`
3. one text `agent_step` — `{kind,at,message:"I'll assemble the launch kit…"}` (no `data`) so `thinking` is non-empty
4. per leg in `["research","landing_copy","og_image"]`, in order:
   - `leg_search` — `{leg,message}`
   - `leg_candidate` — `{leg,message:"<Agent> (<svcId>) $<price> rate 98.0%"}`
   - `hire_negotiating` — `{leg,message:"negotiating <Agent> (<svcId>)",data:{negotiationId}}`
   - `hire_order_created` — `{leg,message,data:{orderId,price}}`; `price` (base units): research `"100000"`, copy `"100000"`, image `"500000"`
   - `hire_paid` — `{leg,message:"paid <Agent> — https://basescan.org/tx/<hash>",data:{orderId,payTxHash}}`
   - `hire_delivered` — `{leg,message,data:{orderId,contentHash}}`
   - `qa_verdict` — `{leg,message:"QA accept: <reason>",data:{score:90}}`
   - `asset_submitted` — `{leg,message:"asset submitted for <leg>"}`
5. `compose_started`, then `run_completed`.

Set `status:"completed"`, `spentBaseUnits:"700000"`, populate `assets[]` (each `LaunchAsset` with a `ProvenanceCard`: `agentName`, `amountUsd` `"0.10"/"0.10"/"0.50"`, `basescanUrl`, `contentHash`, `payTxHash`) and `kit` (all `LaunchKit` fields; set `ogImageRef` to `hash:<contentHash>` to exercise KitView's graceful path). Agents: research/copy `Foundr`, image `Pygm Studio` (keep names consistent across messages + provenance).

- [ ] **Step 2: Write the failing test**

`components/theater/reducer.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type { RunRecord, WorklogEvent } from "@/src/types";
import fixture from "@/test/fixtures/run-completed.json";
import { initialTheaterState, theaterReducer } from "./reducer.js";

const rec = fixture as unknown as RunRecord;
function fold() { return rec.worklog.reduce(theaterReducer, initialTheaterState()); }

it("advances each lane to accepted and sums spend", () => {
  const s = fold();
  expect(s.lanes.research.phase).toBe("accepted");
  expect(s.lanes.og_image.phase).toBe("accepted");
  expect(s.status).toBe("completed");
  expect(s.spentUsd).toBe("0.70");
  expect(s.ledger).toHaveLength(3);
  expect(s.ledger[0].basescanUrl).toMatch(/basescan/i);
});
it("captures the product and thinking narration", () => {
  const s = fold();
  expect(s.product).toBeTruthy();
  expect(s.thinking.length).toBeGreaterThan(0);
});
it("marks a leg blocked on a QA swap/redo (verdict word lives in the message; paid leg still bills)", () => {
  const seq: WorklogEvent[] = [
    { kind: "hire_negotiating", at: 1, leg: "landing_copy", message: "negotiating Pygm Studio (mock-copy)", data: { negotiationId: "n1" } },
    { kind: "hire_order_created", at: 2, leg: "landing_copy", message: "order o1 created", data: { orderId: "o1", price: "100000" } },
    { kind: "hire_paid", at: 3, leg: "landing_copy", message: "paid Pygm Studio — https://basescan.org/tx/0xabc", data: { orderId: "o1", payTxHash: "0xabc" } },
    { kind: "qa_verdict", at: 4, leg: "landing_copy", message: "QA swap: wrong deliverable format", data: { score: 30 } },
  ];
  const s = seq.reduce(theaterReducer, initialTheaterState());
  expect(s.lanes.landing_copy.phase).toBe("blocked");
  expect(s.lanes.landing_copy.note).toMatch(/swap/);
  expect(s.ledger).toHaveLength(1);       // the swapped-away provider was still paid
  expect(s.spentUsd).toBe("0.10");
});
```

- [ ] **Step 3: Run → FAIL.** `pnpm test:run components/theater/reducer.test.ts`

- [ ] **Step 4: Implement `components/theater/reducer.ts`**

```ts
import type { WorklogEvent, LegKind } from "@/src/types";
import { REQUIRED_LEGS, baseUnitsToUsd } from "@/src/constants";

export type Phase = "idle" | "searching" | "candidate" | "negotiating" | "ordered" | "paid" | "delivered" | "accepted" | "blocked";
export interface LaneState { leg: LegKind; phase: Phase; agentName?: string; amountUsd?: string; basescanUrl?: string; note?: string; }
export interface LedgerEntry { agentName: string; amountUsd: string; basescanUrl: string; }
export interface TheaterState {
  status: "running" | "completed" | "partial" | "aborted" | "failed";
  lanes: Record<LegKind, LaneState>; ledger: LedgerEntry[]; thinking: string[];
  spentUsd: string; product?: string; startedAt?: number; endedAt?: number;
}
export function initialTheaterState(): TheaterState {
  const lanes = Object.fromEntries(REQUIRED_LEGS.map((leg) => [leg, { leg, phase: "idle" as Phase }])) as Record<LegKind, LaneState>;
  return { status: "running", lanes, ledger: [], thinking: [], spentUsd: "0.00" };
}
// Events whose only effect is to advance the lane rail (no money/agent extraction).
const PHASE: Partial<Record<WorklogEvent["kind"], Phase>> = {
  leg_search: "searching", leg_candidate: "candidate", hire_delivered: "delivered",
};
const usd = (base: string) => { try { return baseUnitsToUsd(BigInt(base)); } catch { return "0.00"; } };
const sumUsd = (l: LedgerEntry[]) => (l.reduce((a, e) => a + Math.round(Number(e.amountUsd) * 100), 0) / 100).toFixed(2);
// agentName is NOT in event.data; the engine puts it in the hire_negotiating message
// ("negotiating <Agent> (<serviceId>)"). Parse once and carry it on the lane.
const agentFromNegotiating = (msg: string): string | undefined => msg.match(/negotiating (.+?) \(/)?.[1];

export function theaterReducer(s: TheaterState, e: WorklogEvent): TheaterState {
  const d = (e.data ?? {}) as Record<string, unknown>;
  if (e.kind === "run_started") return { ...s, startedAt: e.at };
  if (e.kind === "intake_done") return { ...s, product: (d.oneLiner as string) ?? s.product };
  if (e.kind === "agent_step") return d.tool ? s : { ...s, thinking: [...s.thinking, e.message] };
  if (e.kind === "run_completed") return { ...s, status: "completed", endedAt: e.at };
  if (e.kind === "run_aborted") return { ...s, status: s.ledger.length ? "partial" : "aborted", endedAt: e.at };
  if (e.kind === "error" && e.leg == null) return { ...s, status: s.status === "running" ? "failed" : s.status };

  const leg = e.leg as LegKind | undefined;
  if (!leg || !(leg in s.lanes)) return s; // no-leg events (e.g. compose_started) don't touch lanes
  const lane: LaneState = { ...s.lanes[leg] };
  let ledger = s.ledger;

  switch (e.kind) {
    case "hire_negotiating":
      lane.phase = "negotiating";
      lane.agentName = agentFromNegotiating(e.message) ?? lane.agentName;
      break;
    case "hire_order_created": // data: { orderId, price } — price in USDC base units
      lane.phase = "ordered";
      if (typeof d.price === "string") lane.amountUsd = usd(d.price);
      break;
    case "hire_paid": // data: { orderId, payTxHash } — build the receipt from the tx hash
      lane.phase = "paid";
      if (typeof d.payTxHash === "string") lane.basescanUrl = `https://basescan.org/tx/${d.payTxHash}`;
      if (lane.agentName && lane.amountUsd && lane.basescanUrl)
        ledger = [...s.ledger, { agentName: lane.agentName, amountUsd: lane.amountUsd, basescanUrl: lane.basescanUrl }];
      break;
    case "qa_verdict": { // data: { score }; verdict word is in the message ("QA accept|redo|swap: …")
      if (!e.message.startsWith("QA accept")) lane.phase = "blocked";
      lane.note = e.message.replace(/^QA /, "");
      break;
    }
    case "asset_submitted":
      lane.phase = "accepted";
      break;
    case "hire_blocked":
      lane.phase = "blocked";
      lane.note = e.message;
      break;
    default:
      if (PHASE[e.kind]) lane.phase = PHASE[e.kind]!;
  }
  return { ...s, lanes: { ...s.lanes, [leg]: lane }, ledger, spentUsd: sumUsd(ledger) };
}
```
Verified against `runs/*.json`: `hire_order_created.data={orderId,price}`, `hire_paid.data={orderId,payTxHash}`, `hire_delivered.data={orderId,contentHash}`, `qa_verdict.data={score}` (verdict word in `message`), `leg_candidate`/`asset_submitted` carry no `data`. The fixture (Step 1) uses these exact shapes so fixture and reducer agree.

- [ ] **Step 5: Run → PASS; commit**
```bash
git add components/theater/reducer.ts components/theater/reducer.test.ts test/fixtures/run-completed.json
git commit -S -m "feat(theater): pure theaterReducer folding WorklogEvents into lane/ledger state"
```

---

## Task 11: Theater UI (Layout A) + `useRunStream`

**Files:**
- Create: `components/theater/{useRunStream.ts,BrainBar.tsx,Lane.tsx,MoneyLedger.tsx,ThinkingFeed.tsx,Theater.tsx}`
- Test: `components/theater/Theater.test.tsx`

**Interfaces:**
- Consumes: `theaterReducer`/`initialTheaterState`/`TheaterState` (Task 10).
- Produces: `useRunStream(runId, { mode, speed }): TheaterState` (client hook: opens `EventSource` to `/api/runs/:id/stream`, dispatches each parsed `WorklogEvent` through the reducer; closes on terminal) · `<Theater state={TheaterState} />` (presentational; the hook is wired in the page). Splitting state-source (hook) from view (`<Theater state>`) keeps the view unit-testable without `EventSource`.

- [ ] **Step 1: Write the failing component test** (drives the view from fixture-folded state)

`components/theater/Theater.test.tsx`:
```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { RunRecord } from "@/src/types";
import fixture from "@/test/fixtures/run-completed.json";
import { initialTheaterState, theaterReducer } from "./reducer";
import { Theater } from "./Theater";

const state = (fixture as unknown as RunRecord).worklog.reduce(theaterReducer, initialTheaterState());
it("renders three lanes, the spend meter, and ledger receipts", () => {
  render(<Theater state={state} />);
  expect(screen.getByText(/research/i)).toBeInTheDocument();
  expect(screen.getByText(/og image|image/i)).toBeInTheDocument();
  expect(screen.getByText(/\$0\.70/)).toBeInTheDocument();
  expect(screen.getAllByRole("link").some((a) => a.getAttribute("href")?.includes("basescan"))).toBe(true);
});
```

- [ ] **Step 2: Run → FAIL.** `pnpm test:run components/theater/Theater.test.tsx`

- [ ] **Step 3: Implement the subcomponents and `Theater.tsx`**

`BrainBar.tsx` (status + timer + spend meter), `Lane.tsx` (one leg: name, phase rail, agent, in-lane receipt chip + Basescan link, `blocked` styling + `note`), `MoneyLedger.tsx` (ledger rows: `agentName → $amount → Basescan ✓` link), `ThinkingFeed.tsx` (collapsible `state.thinking`). All presentational, Tailwind, dark, Lucide icons. Then:

```tsx
// Theater.tsx
import type { TheaterState } from "./reducer";
import { REQUIRED_LEGS } from "@/src/constants";
import { BrainBar } from "./BrainBar";
import { Lane } from "./Lane";
import { MoneyLedger } from "./MoneyLedger";
import { ThinkingFeed } from "./ThinkingFeed";

export function Theater({ state }: { state: TheaterState }) {
  return (
    <div className="mx-auto max-w-5xl space-y-3 p-4">
      <BrainBar state={state} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {REQUIRED_LEGS.map((leg) => <Lane key={leg} lane={state.lanes[leg]} />)}
      </div>
      <MoneyLedger entries={state.ledger} />
      <ThinkingFeed lines={state.thinking} />
    </div>
  );
}
```

Implement each subcomponent with real JSX (lane labels: research→"Research", landing_copy→"Landing copy", og_image→"OG image"; receipts use `target="_blank" rel="noopener noreferrer"`).

- [ ] **Step 4: Implement `useRunStream.ts`**

```ts
"use client";
import { useEffect, useReducer } from "react";
import type { WorklogEvent } from "@/src/types";
import { initialTheaterState, theaterReducer, type TheaterState } from "./reducer";

export function useRunStream(runId: string, opts: { speed?: "1" | "4" | "max" } = {}): TheaterState {
  const [state, dispatch] = useReducer(theaterReducer, undefined, initialTheaterState);
  useEffect(() => {
    const qs = opts.speed ? `?speed=${opts.speed}` : "";
    const es = new EventSource(`/api/runs/${runId}/stream${qs}`);
    const handler = (ev: MessageEvent) => { try { dispatch(JSON.parse(ev.data) as WorklogEvent); } catch {} };
    // Each WorklogEventKind is sent as a named SSE event; listen broadly.
    const kinds = ["run_started","intake_done","leg_search","leg_candidate","hire_negotiating","hire_order_created","hire_paid","hire_delivered","qa_verdict","asset_submitted","hire_blocked","compose_started","run_completed","run_aborted","agent_step","error"];
    kinds.forEach((k) => es.addEventListener(k, handler));
    es.onerror = () => es.close();
    return () => es.close();
  }, [runId, opts.speed]);
  return state;
}
```

- [ ] **Step 5: Run → PASS; typecheck; commit**
```bash
git add components/theater
git commit -S -m "feat(theater): Layout A trading-floor UI + useRunStream SSE hook"
```

---

## Task 12: `components/KitView.tsx` — finished kit + provenance + graceful image

**Files:**
- Create: `components/KitView.tsx`, `components/KitView.test.tsx`

**Interfaces:**
- Consumes: `LaunchKit`, `ProvenanceCard` (`src/types.ts`).
- Produces: `<KitView kit={LaunchKit} />` — renders `landingCopy`, `shortPitch`, `phHnBlurb`, `readmePolish`, `tweetThread[]`, and the OG image. **Image rule:** if `ogImageRef` matches `^https?://` → `<img src=…>`; else (`hash:…` / redemption code) → a "provenance-only asset reference" card, never a broken `<img>`. Provenance cards from `kit.provenance[]` with Basescan links. Copy-to-clipboard buttons; a download (kit JSON) link.

- [ ] **Step 1: Write the failing test**

`components/KitView.test.tsx`:
```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { LaunchKit } from "@/src/types";
import { KitView } from "./KitView";

const base: LaunchKit = {
  landingCopy: "Headline: Streaky", ogImageRef: "hash:0xabc", tweetThread: ["1/ gm"], shortPitch: "pitch",
  phHnBlurb: "blurb", readmePolish: "readme",
  provenance: [{ leg: "research", agentId: "a", agentName: "Foundr", amountUsd: "0.10", contentHash: "0xh", payTxHash: "0xp", basescanUrl: "https://basescan.org/tx/0xp" }],
};
it("renders a provenance card with a Basescan link", () => {
  render(<KitView kit={base} />);
  expect(screen.getByText("Foundr")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /basescan/i })).toHaveAttribute("href", "https://basescan.org/tx/0xp");
});
it("shows a reference card (not a broken img) for a hash ogImageRef", () => {
  render(<KitView kit={base} />);
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getByText(/asset reference/i)).toBeInTheDocument();
});
it("renders an <img> for a real image url", () => {
  render(<KitView kit={{ ...base, ogImageRef: "https://img.example/og.png" }} />);
  expect(screen.getByRole("img")).toHaveAttribute("src", "https://img.example/og.png");
});
```

- [ ] **Step 2: Run → FAIL.** `pnpm test:run components/KitView.test.tsx`

- [ ] **Step 3: Implement `components/KitView.tsx`** (real JSX; the image branch keys off `/^https?:\/\//.test(kit.ogImageRef)`).

- [ ] **Step 4: Run → PASS; commit**
```bash
git add components/KitView.tsx components/KitView.test.tsx
git commit -S -m "feat(web): KitView — launch kit, provenance cards, graceful image handling"
```

---

## Task 13: Pages — Landing, Intake, Theater, Replay, Kit

**Files:**
- Create/replace: `app/(marketing)/page.tsx` (replace the Task-1 placeholder), `app/intake/page.tsx`, `app/run/[id]/page.tsx`, `app/replay/[id]/page.tsx`, `app/kit/[id]/page.tsx`
- Test: `app/intake/page.test.tsx`

**Interfaces:**
- Consumes: `useRunStream`/`Theater` (Task 11), `KitView` (Task 12), `loadRecord`/`listRecords` (Task 3).
- Produces the five routes. `run/[id]` and `replay/[id]` are client components mounting `<Theater state={useRunStream(id, …)} />` (+ `<KitView>` when status settles). `kit/[id]` is a server component reading `loadRecord(id)`. Landing is a server component listing recent replays via `listRecords()`.

- [ ] **Step 1: Write the failing test** (intake form: github URL is detected, sandbox posts)

`app/intake/page.test.tsx`:
```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Intake from "./page";

beforeEach(() => { (globalThis as any).fetch = vi.fn(async () => new Response(JSON.stringify({ runId: "run-1" }), { status: 200 })); });

it("posts a sandbox run and routes to the theater", async () => {
  const push = vi.fn();
  vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
  render(<Intake />);
  await userEvent.type(screen.getByPlaceholderText(/one-liner or github/i), "https://github.com/a/b");
  await userEvent.click(screen.getByRole("button", { name: /try it free|run/i }));
  expect((globalThis as any).fetch).toHaveBeenCalledWith("/api/runs", expect.objectContaining({ method: "POST" }));
});
```
Note: if mocking `next/navigation` proves fiddly under vitest, assert on the `fetch` POST body only and drop the router assertion — the POST is the contract that matters.

- [ ] **Step 2: Run → FAIL.** `pnpm test:run app/intake/page.test.tsx`

- [ ] **Step 3: Implement the five pages** with real code:
  - **Landing** (`app/(marketing)/page.tsx`): hero + one-liner + three CTAs (`/intake?mode=sandbox`, `/intake?mode=live`, a flagship `/replay/<id>` from `listRecords()[0]`), and a "recent runs" list linking `/replay/:id` with each record's status + `baseUnitsToUsd(BigInt(spentBaseUnits))`.
  - **Intake** (`"use client"`): one input (`placeholder="Paste a one-liner or a GitHub URL"`), mode from `?mode=`, submit → `fetch("/api/runs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(detectInput(value, mode))})` → `router.push("/run/"+runId)`. `detectInput` puts `repoUrl` when the value matches the github regex else `text`.
  - **Theater page** (`app/run/[id]/page.tsx`, `"use client"`): `const state = useRunStream(id); return <><Theater state={state}/>{state.status!=="running" && <KitLink id={id}/>}</>`.
  - **Replay page** (`app/replay/[id]/page.tsx`, `"use client"`): same but `useRunStream(id, { speed })` with a 1×/4×/skip control; show `<KitView>` from a fetched record under the stage.
  - **Kit page** (`app/kit/[id]/page.tsx`, server): `const rec = await loadRecord(id); if(!rec?.kit) return notFound(); return <KitView kit={rec.kit}/>`.

- [ ] **Step 4: Run → PASS; typecheck; build**

Run: `pnpm test:run` (full suite) → all PASS. `pnpm typecheck` → clean. `pnpm exec next build` → standalone build OK.

- [ ] **Step 5: Commit**
```bash
git add app
git commit -S -m "feat(web): five Door-A pages — landing, intake, theater, replay, kit"
```

---

## Task 14: Railway deploy (sandbox + replay live on a URL)

**Files:**
- Create: `railway.json` (or `Dockerfile`), `.env.example` (web vars), `docs/superpowers/specs/2026-06-29-phase2-door-a-deploy.md` (env + volume notes)

**Interfaces:**
- Produces: a deployed Railway service serving the app, a mounted volume at `/data` (`RUNS_DIR=/data/runs`), and a smoke confirming a sandbox run streams + a replay plays on the public URL.

- [ ] **Step 1: Add the Railway skill + init**
```bash
npx skills add railwayapp/railway-skills
```
Then follow the Railway skill to create a project + service from this repo.

- [ ] **Step 2: Build config** — `railway.json`:
```json
{ "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS", "buildCommand": "pnpm install --frozen-lockfile && pnpm build" },
  "deploy": { "startCommand": "node .next/standalone/server.js", "restartPolicyType": "ON_FAILURE" } }
```
Ensure `next.config.mjs` has `output: "standalone"` (Task 1). Copy `.next/static` and `public` next to the standalone server per Next's standalone docs (Nixpacks: add a postbuild `cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/ 2>/dev/null || true`).

- [ ] **Step 3: Volume + env vars**

Mount a Railway volume at `/data`. Set service variables: all engine vars (`CROO_API_URL`, `CROO_WS_URL`, `CROO_SDK_KEY`, `BASE_RPC_URL`, `OLLAMA_API_KEY`, `OLLAMA_BASE_URL`, `PRAECO_AGENT_ID`, `PRAECO_AGENT_WALLET`), plus `RUNS_DIR=/data/runs`, `PUBLIC_BASE_URL=<railway url>`, and `NODE_ENV=production`. **Do not** set `LIVE_RUN_TOKEN` yet (live deferred). Seed the volume with the committed flagship replay (upload a real completed `runs/*.json`) so Landing has a replay on first load. Record the var list in `.env.example`.

- [ ] **Step 4: Deploy + smoke**

Deploy. Then verify on the public URL: (a) open `/intake?mode=sandbox`, submit a one-liner, confirm the Theater streams lanes + ledger to a finished kit; (b) open `/replay/<seeded-id>` and confirm paced playback + kit. Capture the URL.

- [ ] **Step 5: Commit**
```bash
git add railway.json .env.example docs/superpowers/specs/2026-06-29-phase2-door-a-deploy.md
git commit -S -m "chore(deploy): Railway standalone build, volume, env — Door A live (sandbox+replay)"
```

---

## Deferred to follow-on plans (out of scope here)

- **Engine §7 quality fixes** (own plan): copy/image deliverable-FORMAT (Pygm redemption codes → inline content via provider swap or a redeem/fetch step), QA `swap` vs `redo`, authoritative-pin redo-cap. Needed for a clean 3/3 golden-path replay before the demo video.
- **Door B — CAP seller listing** (own plan, spec §8): starts with a seller-SDK de-risk spike; lists Praeco (~$2 service) and routes inbound orders to the same `runLaunchJob`. Mandatory hard requirement; brings Praeco ONLINE.
- **Live-mode hardening + the gated live run** (spec §11 step 5): set `LIVE_RUN_TOKEN`, top up the agent wallet, run a real on-chain golden path to seed the flagship replay, harden the live WS lifecycle.
- **Phase 3 traction / Phase 4 submit:** browser wallet-connect→pay-Praeco buyer flow, ≥5 buyer wallets, `feat/phase0-derisk → main`, public flip (MIT), BUIDL filing.

---

## Self-Review

**Spec coverage:** D2/D3 Railway single-service standalone → T1+T14. §3.2 repo structure → T1 file layout. §4 SSE run-hub + lifecycle → T4/T8/T9. §4.2 replay pacer → T6. §4.3 wire format → T9 (`sseFrame`). §5 modes + gating → T5/T7/T8. §6 screen 1–5 → T11/T12/T13. §6 graceful image → T12. §9 persistence → T3. §10 testing (hub, pacer, reducer, route validation, fixture) → T3–T13. Deferred §7/§8/§11-step-5 listed explicitly. **No uncovered in-scope requirement.**

**Placeholder scan:** every code step shows real code; the only "fill-in" is the fixture's full content (T10 Step 1 specifies exact kinds/fields/amounts) and the subcomponent JSX (T11 Step 3 specifies each component's contents/labels) — both are described concretely, not as "TODO".

**Type consistency:** `RunMode`/`SseEvent`/`StartRunRequest` defined in T3 and used unchanged in T4–T9. `TheaterState`/`LaneState`/`LedgerEntry` defined in T10, consumed in T11. `Runner` signature defined in T8 and matched by the T8 test's fake. **Money-event shapes resolved against real `runs/*.json`** (not guessed): `hire_order_created.data.price` (base units), `hire_paid.data.payTxHash`, `qa_verdict` verdict-word-in-message — the fixture (T10 Step 1) and reducer (T10 Step 4) are written to these exact shapes and cross-checked by the swap-case test. No remaining unknowns in scope.
