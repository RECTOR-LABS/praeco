# Praeco Phase-0 (De-risk + Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (inline, with checkpoints — Phase-0 has human-gated steps and live-money smoke tests, so it is collaborative, not fully autonomous). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the repo foundation and prove the full integration stack end-to-end — Pi SDK + GLM-5.2:cloud, and `@croo-network/sdk` hiring a real CROO agent and settling USDC on Base — then resolve the spec's open questions (SPEC §15) so Phase 1 can be planned against reality.

**Architecture:** A TypeScript monorepo-light layout (single package for now). Throwaway smoke scripts under `scripts/` validate each external dependency in isolation before any engine code is written. Findings are captured in a committed FINDINGS doc that updates the spec's unknowns.

**Tech Stack:** TypeScript · pnpm · Node ≥22.19 · tsx (script runner) · vitest (tests) · `@earendil-works/pi-ai` (LLM) · GLM-5.2:cloud via Ollama Cloud · `@croo-network/sdk` (CAP) · Base / USDC.

## Global Constraints

- **License:** MIT (hard hackathon requirement). `LICENSE` file present from the first commit.
- **No AI attribution** in any commit, doc, or file (RECTOR rule). GPG-sign commits with key `BF47B9DC1FA320FA`.
- **No secrets in git.** All keys via `.env` (gitignored); ship `.env.example` with empty values.
- **Node:** `>=22.19.0` (pi-ai requirement). Enforce via `package.json` `engines`.
- **Tests:** vitest; `pnpm test:run` green before each commit; 80%+ on new logic code (smoke scripts exempt — they are manual spikes).
- **Settlement is real money.** Any step that calls `payOrder()` moves USDC. Those steps are **RECTOR-authorized only**, use a tiny pre-funded amount, and prefer testnet if Task 5 finds it works. Claude never initiates a live payment without explicit per-run approval.
- **Deadline:** Jul 9 — Phase-0 should complete in ~2 days.

---

### Task 1: Repo skeleton + toolchain

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `LICENSE`, `README.md`, `vitest.config.ts`
- Create: `src/config.ts`
- Test: `src/config.test.ts`

**Interfaces:**
- Produces: `loadConfig(): Config` from `src/config.ts`, where `Config = { crooApiUrl: string; crooWsUrl: string; crooSdkKey: string; baseRpcUrl: string; ollamaApiKey: string; ollamaBaseUrl: string }`. Throws if a required var is missing.

- [ ] **Step 1: Initialize package + dev deps**

Run:
```bash
cd /Users/rector/local-dev/praeco
pnpm init
pnpm add -D typescript tsx vitest @types/node
pnpm add @earendil-works/pi-ai @croo-network/sdk dotenv zod
```

- [ ] **Step 2: Write `package.json` scripts + engines**

Merge into `package.json`:
```json
{
  "type": "module",
  "engines": { "node": ">=22.19.0" },
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "smoke:llm": "tsx scripts/llm-smoke.ts",
    "smoke:cap": "tsx scripts/cap-connect.ts",
    "smoke:hire": "tsx scripts/cap-hire.ts"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`, `.gitignore`, `LICENSE`, `.env.example`**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ES2022", "moduleResolution": "Bundler",
    "strict": true, "esModuleInterop": true, "skipLibCheck": true,
    "resolveJsonModule": true, "types": ["node"], "outDir": "dist"
  },
  "include": ["src", "scripts"]
}
```
`.gitignore`:
```
node_modules
dist
.env
*.log
```
`LICENSE`: MIT, copyright holder "RECTOR".
`.env.example`:
```
CROO_API_URL=https://api.croo.network
CROO_WS_URL=wss://api.croo.network/ws
CROO_SDK_KEY=croo_sk_xxx
BASE_RPC_URL=https://mainnet.base.org
OLLAMA_API_KEY=
OLLAMA_BASE_URL=https://ollama.com/v1
```

- [ ] **Step 4: Write the failing config test**

`src/config.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("throws when a required var is missing", () => {
    expect(() => loadConfig({})).toThrow(/CROO_API_URL/);
  });
  it("returns a populated config when all vars are present", () => {
    const env = {
      CROO_API_URL: "a", CROO_WS_URL: "b", CROO_SDK_KEY: "c",
      BASE_RPC_URL: "d", OLLAMA_API_KEY: "e", OLLAMA_BASE_URL: "f",
    };
    expect(loadConfig(env).crooApiUrl).toBe("a");
  });
});
```

- [ ] **Step 5: Run test, verify it fails**

Run: `pnpm test:run`
Expected: FAIL — `loadConfig` not found.

- [ ] **Step 6: Implement `src/config.ts`**

```typescript
export interface Config {
  crooApiUrl: string; crooWsUrl: string; crooSdkKey: string;
  baseRpcUrl: string; ollamaApiKey: string; ollamaBaseUrl: string;
}
const REQUIRED = [
  "CROO_API_URL", "CROO_WS_URL", "CROO_SDK_KEY",
  "BASE_RPC_URL", "OLLAMA_API_KEY", "OLLAMA_BASE_URL",
] as const;
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  for (const k of REQUIRED) if (!env[k]) throw new Error(`Missing required env var: ${k}`);
  return {
    crooApiUrl: env.CROO_API_URL!, crooWsUrl: env.CROO_WS_URL!, crooSdkKey: env.CROO_SDK_KEY!,
    baseRpcUrl: env.BASE_RPC_URL!, ollamaApiKey: env.OLLAMA_API_KEY!, ollamaBaseUrl: env.OLLAMA_BASE_URL!,
  };
}
```

- [ ] **Step 7: Run test, verify it passes**

Run: `pnpm test:run`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json .gitignore .env.example LICENSE README.md vitest.config.ts src/config.ts src/config.test.ts
git commit -m "chore: scaffold Praeco repo (TS, pnpm, vitest) + config loader"
```

---

### Task 2: [RECTOR — manual] CROO Dashboard account, agent, service key + funded wallet

> **Human-gated.** Claude cannot create accounts or move funds. RECTOR performs this; Claude documents the results into `.env` and FINDINGS.

- [ ] **Step 1: Create CROO account + Praeco agent in the Dashboard**

At `agent.croo.network` → register an agent named **Praeco**. Note any **listing/registration fee** (SPEC §15.3).

- [ ] **Step 2: Register Praeco's own service (Door B) + issue an SDK key**

Create a service (e.g. "Compose a launch kit"); issue a `croo_sk_...` **SDK key**. Record the agent's **AA wallet address**.

- [ ] **Step 3: Fund the AA wallet with a small USDC amount on Base**

Send ~**$5 USDC** to the AA wallet address (covers many $0.10–0.50 smoke hires). Record the funding tx. *(If Task 5 confirms testnet works, redo on testnet instead.)*

- [ ] **Step 4: Populate `.env`**

Fill `CROO_SDK_KEY`, confirm `CROO_API_URL`/`CROO_WS_URL`, set `BASE_RPC_URL`, and add `OLLAMA_API_KEY` (from ollama.com account). Note the AA wallet address in FINDINGS.

---

### Task 3: GLM-5.2 via pi-ai smoke (LLM wiring)

**Files:**
- Create: `scripts/llm-smoke.ts`

**Interfaces:**
- Consumes: `loadConfig()` (Task 1).
- Produces: confirmation that `complete()` works against `glm-5.2:cloud`, plus tool-calling + JSON behavior notes for FINDINGS.

- [ ] **Step 1: Write the smoke script**

`scripts/llm-smoke.ts`:
```typescript
import "dotenv/config";
import { complete } from "@earendil-works/pi-ai";
import { createOpenAI } from "@earendil-works/pi-ai/providers/openai-responses";
import { loadConfig } from "../src/config.js";

const cfg = loadConfig();
const provider = createOpenAI({ apiKey: cfg.ollamaApiKey, baseURL: cfg.ollamaBaseUrl });

// 1. Basic generation
const hello = await complete({
  provider, model: "glm-5.2:cloud",
  messages: [{ role: "user", content: "Reply with exactly: PRAECO ONLINE" }],
  maxTokens: 64,
});
console.log("[basic]", hello.text);

// 2. Structured brief (does GLM follow JSON instructions well?)
const brief = await complete({
  provider, model: "glm-5.2:cloud",
  messages: [{ role: "user", content: 'Return ONLY JSON: {"product":string,"audience":string} for a habit-tracker app.' }],
  maxTokens: 256,
});
console.log("[json]", brief.text);

// 3. Tool-calling (critical for the orchestrator)
const tooled = await complete({
  provider, model: "glm-5.2:cloud",
  messages: [{ role: "user", content: "Hire a research agent for 'Streaky'." }],
  tools: [{
    name: "hire_agent",
    description: "Hire a specialist agent by role",
    inputSchema: { type: "object", properties: { role: { type: "string" } }, required: ["role"] },
  }],
});
console.log("[tools]", JSON.stringify(tooled.toolCalls ?? "none"));
```

- [ ] **Step 2: Run it**

Run: `pnpm smoke:llm`
Expected: `[basic] PRAECO ONLINE`; `[json]` prints valid JSON; `[tools]` prints a `hire_agent` tool call with `{role:"research"}` (or similar).

- [ ] **Step 3: Record findings**

Note in scratch: exact working `OLLAMA_BASE_URL`, latency, whether tool-calling fired reliably, JSON cleanliness. (Feeds Task 7 + the Phase-1 orchestrator decision: LLM-driven vs deterministic loop.)

---

### Task 4: CAP connect smoke (auth + WebSocket)

**Files:**
- Create: `scripts/cap-connect.ts`

**Interfaces:**
- Consumes: `loadConfig()`.
- Produces: confirmation the SDK authenticates, opens the WebSocket, and can list orders/negotiations.

- [ ] **Step 1: Write the connect script**

`scripts/cap-connect.ts`:
```typescript
import "dotenv/config";
import { AgentClient } from "@croo-network/sdk";
import { loadConfig } from "../src/config.js";

const cfg = loadConfig();
const client = new AgentClient(
  { baseURL: cfg.crooApiUrl, wsURL: cfg.crooWsUrl, rpcURL: cfg.baseRpcUrl },
  cfg.crooSdkKey,
);

const orders = await client.listOrders({ status: "completed", page: 1, pageSize: 10 });
console.log("[orders]", orders);

const stream = await client.connectWebSocket();
console.log("[ws] connected:", !!stream);
stream.on?.("error", (e: unknown) => console.error("[ws] error", e));
setTimeout(() => process.exit(0), 3000);
```

- [ ] **Step 2: Run it**

Run: `pnpm smoke:cap`
Expected: prints an orders list (likely empty) and `[ws] connected: true` with no auth error. If auth fails, the `CROO_SDK_KEY` / endpoints are wrong (fix Task 2).

- [ ] **Step 3: Record findings**

Note: did it connect? any testnet hint in config? the exact `listOrders` return shape (for Phase-1 typing).

---

### Task 5: Discovery / serviceId resolution

> The SDK has **no marketplace search** — `negotiateOrder` needs a `serviceId`. Resolve how Praeco discovers services + whether reputation data exists (SPEC §15.7, novelty 3).

**Files:**
- Create: `scripts/discover.ts` (only if the CAP MCP is reachable from Node; otherwise this task is manual capture)

- [ ] **Step 1: Capture candidate serviceIds from the Agent Store**

For each launch-kit leg, open the service in `agent.croo.network` and record its `serviceId` + price + owner: **research** (ProofResearch), **landing/copy** (Foundr "Landing Page"), **image** (Pygm "Image Code"), **SEO** (OpsPilot "seo_rules_audit"). Save to `.env` as `SVC_RESEARCH=`, `SVC_LANDING=`, `SVC_IMAGE=`, `SVC_SEO=`.

- [ ] **Step 2: Probe the CAP MCP for programmatic search + reputation**

Attempt `marketplace.search` via the CAP MCP (`mcp://crew.network`, tools seen: `marketplace.search`, `task.fund`, `settle.preview`, `wallet.balance`). Determine: can we search/rank by reputation/Merit/completion-rate at runtime? Record the answer.

- [ ] **Step 3: Decide the Discovery approach for Phase 1**

Document the decision: **(a)** runtime `marketplace.search` via MCP with reputation ranking (full novelty 3), or **(b)** a curated, periodically-refreshed serviceId roster with fallback providers per leg (novelty 3 degrades to curated-quality). Either is viable; pick based on Steps 1–2.

---

### Task 6: CAP end-to-end hire smoke (the core de-risk)

> **RECTOR-authorized, live money.** Hires ONE real cheap service and settles USDC. Run on **testnet first** if Task 4/5 found it works; otherwise a single tiny **mainnet** order (~$0.10) with RECTOR's explicit go-ahead.

**Files:**
- Create: `scripts/cap-hire.ts`

**Interfaces:**
- Produces: a real `{ txHash }` + a `deliverableText` — proof Praeco can discover→hire→pay→receive→settle on CAP. The reference flow the Phase-1 Orchestrator is built from.

- [ ] **Step 1: Write the hire script**

`scripts/cap-hire.ts`:
```typescript
import "dotenv/config";
import { AgentClient, EventType } from "@croo-network/sdk";
import { loadConfig } from "../src/config.js";

const cfg = loadConfig();
const serviceId = process.env.SVC_SEO!; // cheapest leg ($0.10) for the smoke
const client = new AgentClient(
  { baseURL: cfg.crooApiUrl, wsURL: cfg.crooWsUrl, rpcURL: cfg.baseRpcUrl },
  cfg.crooSdkKey,
);

const stream = await client.connectWebSocket();

stream.on(EventType.OrderCreated, async (e: any) => {
  console.log("[order] created", e.order_id, "→ paying…");
  const pay = await client.payOrder(e.order_id);          // moves USDC — authorized
  console.log("[order] paid tx:", pay.txHash, "→ https://basescan.org/tx/" + pay.txHash);
});

stream.on(EventType.OrderCompleted, async (e: any) => {
  const delivery = await client.getDelivery(e.order_id);
  console.log("[delivery]", delivery.deliverableText?.slice(0, 400));
  process.exit(0);
});

const neg = await client.negotiateOrder({
  serviceId,
  requirements: JSON.stringify({ url: "https://example.com", task: "smoke test" }),
});
console.log("[negotiation]", neg.negotiationId);
setTimeout(() => { console.error("timeout"); process.exit(1); }, 120_000);
```

- [ ] **Step 2: RECTOR confirms, then run**

Confirm the AA wallet is funded and RECTOR approves the live spend. Run: `pnpm smoke:hire`
Expected: prints `negotiationId` → `[order] created` → `[order] paid tx: 0x…` (a real Basescan link) → `[delivery] …`. Capture the txHash + delivery.

- [ ] **Step 3: Record the full trace**

Save: negotiationId, orderId, txHash, delivery shape, the proof/attestation fields present, total wall-clock, actual USDC spent. This is the golden reference for Phase 1.

---

### Task 7: FINDINGS doc — resolve SPEC §15 and gate Phase 1

**Files:**
- Create: `docs/superpowers/specs/2026-06-27-phase0-findings.md`

- [ ] **Step 1: Write findings answering every §15 question**

Document, with evidence from Tasks 2–6: testnet vs mainnet (and whether judges require mainnet — confirm in CROO Discord), listing/registration fee, exact per-service prices + serviceIds, AA-wallet/ERC-4337 funding cost, confirmed Pi SDK call signatures, whether reputation data is queryable (Discovery decision from Task 5), and any CROO builder faucet/credit.

- [ ] **Step 2: Note any spec deltas**

List anything that changes the SPEC (e.g., Discovery approach (b), provider registration being dashboard-only, the Door-A payment rail). These feed the Phase-1 plan.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-06-27-phase0-findings.md scripts/ .env.example src/
git commit -m "chore(phase0): de-risk findings — CAP + Pi SDK + GLM smoke verified"
```

---

## Self-Review

- **Spec coverage (§15):** all 8 open questions map to Tasks 2/4/5/6/7. Hard requirements: MIT LICENSE (Task 1), CAP-callable/settles (Tasks 4/6), Agent Store listing (Task 2) — covered or scheduled.
- **Placeholder scan:** smoke-script code is complete and runnable; `serviceId`/keys come from `.env` (real values filled in Tasks 2/5), which is correct, not a placeholder.
- **Type consistency:** `loadConfig()`/`Config` used consistently across scripts; `AgentClient` constructor + `negotiateOrder`/`payOrder`/`getDelivery`/`EventType` match the confirmed `@croo-network/sdk` surface; `complete()`/`createOpenAI` match the confirmed `pi-ai` surface.
- **Known uncertainties (validated *by* this plan):** exact `OLLAMA_BASE_URL`, testnet availability, MCP search reachability, AA-wallet payment mechanics — each has a task that confirms it.
