# Praeco Phase-1 Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the autonomous Praeco engine — a GLM-5.2 agent loop that takes a one-line/repo brief, then discovers, hires, pays (real USDC on Base), QA-reviews, and composes a full launch kit from 3 real CAP specialists, with on-chain provenance.

**Architecture:** A pi-agent-core `Agent` (GLM-5.2 via Ollama Cloud) drives the job by calling deterministic, money-guarded tools (`search_marketplace`, `get_service_schema`, `hire_specialist`, `qa_review`, `submit_asset`). The LLM has agency over *decisions* (which provider, accept/redo/swap, schema-fill, compose); **money invariants are enforced in code** by the loop's `beforeToolCall` hook (hard per-run + per-leg budget caps, wallet-balance gate, pay-idempotency) and a `turn_end` runaway backstop. CAP order tracking is poll-based (the proven Phase-0 sequence), not raw-WS-event-based. Every step emits a typed `WorklogEvent` (the Phase-2 Theater's backbone) via `Agent.subscribe()`.

**Tech Stack:** TypeScript (ESM, Node ≥22.19), `@earendil-works/pi-ai` + `@earendil-works/pi-agent-core` (GLM-5.2 agent runtime), `@croo-network/sdk` (CAP buyer ops + on-chain settle), `zod` (structured-output validation), `vitest` (tests). No new runtime deps beyond `@earendil-works/pi-agent-core` (added in Task 13).

## Global Constraints

- **No AI attribution** anywhere — commits, code, docs. Write as a human developer. (CIPHER rule.)
- **GPG-sign every commit** (key `BF47B9DC1FA320FA`). One commit per logical unit (one per task here).
- `pnpm typecheck` (`tsc --noEmit`) **and** `pnpm test:run` (vitest) must be green before every commit.
- **CROO/CAP is Base MAINNET only — there is no testnet.** (Overrides SPEC §12's "testnet first" line.) All automated tests **mock** the CAP SDK, `fetch`, and the LLM — zero real money, zero network in CI. Live behavior is validated only by deliberately-run smoke scripts (Task 17), gated behind RECTOR's per-session authorization, exactly like the Phase-0 `smoke:hire`.
- **Agents hire from their OWN wallet** (`PRAECO_AGENT_WALLET` = `0xee47…7D31`), NOT the account wallet. An empty agent wallet silently hangs a hire `pending` with no rejection. Treat agent-wallet balance as a first-class hire gate (Task 4, enforced in Task 14).
- **Money guards are code, not prompt.** The LLM cannot overspend: `beforeToolCall` blocks any `hire_specialist` whose quoted price exceeds the remaining run budget or the per-leg cap; payment is idempotent (never pay an orderId twice); a hard `MAX_TURNS` backstop aborts runaway loops.
- **USDC amounts are integers (base units, 6 decimals) using `bigint`** — never floats. `100000` = `$0.10`. Format to dollars only for display.
- **Prices/IDs are secrets-adjacent config** — read from env via `loadConfig()`; never hardcode keys, wallets, or service IDs in source (the Base USDC token address is the one allowed on-chain constant).
- Strict TypeScript. No `TODO`/`FIXME` in delivered code. Errors must be specific and actionable (name the offending var/leg/order). No silent catches.

## Design Decisions (resolved before planning)

1. **Orchestrator = Pi agent-loop (spec-literal, RECTOR-confirmed).** GLM-5.2 drives the hire by emitting tool calls; we add `@earendil-works/pi-agent-core`. Hardened with code-level money guards (above) so the agentic narrative carries no overspend risk.
2. **Phase-1 scope = full MVP kit incl. image (RECTOR-confirmed).** 3 real legs: `research` + `landing_copy` ($0.10 text) + `og_image` ($0.50, URL/binary deliverable). De-risks the multimodal deliverable path now.
3. **Discovery is a thin `fetch` client** against the public REST (`{CROO_API_URL}/backend/v1/public/{services|search|agents/{id}}`) — the SDK has no marketplace search. Ranking is reputation-weighted (`completionRate`/`completedOrders`), with env-pinned preferred providers ranked first for demo reliability.
4. **Order tracking is poll-based** (`getNegotiation`/`listOrders`/`getOrder`) — the WS is held only for online presence (it replays historical events on connect).
5. **Worklog now, SSE later.** The engine emits typed `WorklogEvent`s into an in-memory `RunRecord` in Phase 1; Phase 2's Theater just pipes them to SSE. No persistence layer beyond writing the `RunRecord` JSON to `runs/<id>.json`.
6. **The agent loop is validated by a smoke, not a unit test.** You cannot deterministically unit-test "GLM drives the loop" without fabricating LLM event streams (which would test the mock, not the system). So: every tool/guard/helper is unit-tested with injected fakes (full CI coverage of money logic); the *assembled loop* is proven by `engine:smoke` (real GLM + mock CAP, no money) and the final `engine:run` live mainnet pass.

---

## File Structure

```
src/
  config.ts              [MODIFY] + PRAECO_AGENT_ID/WALLET, budgets, preferred service IDs
  config.test.ts         [MODIFY] cover new vars
  constants.ts           [NEW] Base USDC addr, decimals, defaults, REQUIRED_LEGS, base-unit math
  constants.test.ts      [NEW]
  types.ts               [NEW] domain contract (LaunchBrief, ServiceCandidate, HireResult, LaunchKit, WorklogEvent, RunRecord, …)
  llm/
    model.ts             [NEW] createGlmModels() → { models, model, streamFn }  (extracted from llm-smoke)
    model.test.ts        [NEW]
    llm.ts               [NEW] Llm facade: createLlm(models, model) → { completeText, completeJson }  (robust JSON + repair)
    llm.test.ts          [NEW]
  cap/
    wallet.ts            [NEW] getUsdcBalance() via raw eth_call; assertFunded()
    wallet.test.ts       [NEW]
    discovery.ts         [NEW] searchServices(), getAgent(), rankCandidates()
    discovery.test.ts    [NEW]
    hire.ts              [NEW] hireSpecialist() — guarded negotiate→pay→deliver, poll-based
    hire.test.ts         [NEW]
  engine/
    budget.ts            [NEW] BudgetGuard (per-run + per-leg caps, bigint)
    budget.test.ts       [NEW]
    qa.ts                [NEW] reviewDeliverable() → QaVerdict
    qa.test.ts           [NEW]
    intake.ts            [NEW] buildBrief() — text or repo-native (README+package.json)
    intake.test.ts       [NEW]
    provenance.ts        [NEW] toProvenanceCard(), extractImageRef()
    provenance.test.ts   [NEW]
    compose.ts           [NEW] composeKit() → LaunchKit
    compose.test.ts      [NEW]
    worklog.ts           [NEW] Worklog collector + mapAgentEvent()
    worklog.test.ts      [NEW]
    tools.ts             [NEW] buildTools(ctx) → AgentTool[]
    tools.test.ts        [NEW]
    guard.ts             [NEW] makeBeforeToolCall/makeAfterToolCall/makeTurnGuard
    guard.test.ts        [NEW]
    agent.ts             [NEW] createPraecoAgent(deps) → Agent
    agent.test.ts        [NEW] (fake streamFn — deterministic loop test)
    run.ts               [NEW] runLaunchJob(input, deps) → RunRecord
    run.test.ts          [NEW] (full scripted run, mock CAP)
scripts/
  run-job.ts             [NEW] pnpm engine:run  (LIVE) / pnpm engine:smoke (mock CAP)
```

---

## Stage A — Foundations (config, constants, domain types, LLM layer)

### Task 1: Config + constants + domain contract

**Files:**
- Modify: `src/config.ts`
- Modify: `src/config.test.ts`
- Create: `src/constants.ts`
- Create: `src/constants.test.ts`
- Create: `src/types.ts`

**Interfaces:**
- Produces: `Config` (extended), `loadConfig(env)`; `BASE_USDC_ADDRESS`, `USDC_DECIMALS`, `REQUIRED_LEGS`, `DEFAULT_RUN_BUDGET_USDC`, `DEFAULT_LEG_CAP_USDC`, `usdToBaseUnits(usd: string): bigint`, `baseUnitsToUsd(b: bigint): string`; and every domain type in `src/types.ts` (the contract all later tasks import).

- [ ] **Step 1: Write `src/types.ts` (the domain contract — no test; type-only module)**

```typescript
/** Praeco domain contract — shared types for the whole engine. */

export type LegKind = "research" | "landing_copy" | "og_image";

export interface LaunchBrief {
  product: string;       // what it is, one line
  audience: string;      // who it's for
  features: string[];    // key selling points
  tone: string;          // voice / positioning
  oneLiner: string;      // punchy one-sentence pitch
  sourceUrl?: string;    // repo URL when repo-native intake was used
}

export interface RequirementField {
  name: string;
  type: string;          // "string" | "boolean" | …
  required: boolean;
}

export interface ServiceCandidate {
  serviceId: string;
  agentId: string;
  agentName: string;
  title: string;                 // service title
  priceBaseUnits: string;        // USDC base units, decimal string
  requirementType: string;       // "schema" | "text"
  requirementSchema: RequirementField[];
  requirementText?: string;
  completedOrders: number;
  completionRate: number;        // 0..1
  avgDeliveryText?: string;
  onlineStatus?: string;
  orders7d?: number;
}

export interface Deliverable {
  type: string;          // "schema" | "text"
  text?: string;         // deliverableText, if any
  schema?: unknown;      // parsed deliverableSchema JSON, if any
  contentHash: string;
}

export interface HireResult {
  leg: LegKind;
  serviceId: string;
  agentId: string;
  agentName: string;
  orderId: string;
  chainOrderId: string;
  priceBaseUnits: string;
  payTxHash: string;
  deliverTxHash: string;
  deliverable: Deliverable;
  basescanPayUrl: string;
  basescanDeliverUrl: string;
}

export type QaAction = "accept" | "redo" | "swap";

export interface QaVerdict {
  action: QaAction;
  reason: string;
  score?: number;        // 0..100, optional
}

export interface ProvenanceCard {
  leg: LegKind;
  agentId: string;
  agentName: string;
  amountUsd: string;     // formatted, e.g. "0.10"
  contentHash: string;
  payTxHash: string;
  basescanUrl: string;
}

export interface LaunchAsset {
  leg: LegKind;
  hire: HireResult;
  verdict: QaVerdict;
  provenance: ProvenanceCard;
}

export interface LaunchKit {
  landingCopy: string;
  ogImageRef: string;    // URL or "hash:<contentHash>" reference
  tweetThread: string[];
  shortPitch: string;
  phHnBlurb: string;
  readmePolish: string;
  provenance: ProvenanceCard[];
}

export type WorklogEventKind =
  | "run_started" | "intake_done" | "leg_search" | "leg_candidate"
  | "hire_negotiating" | "hire_order_created" | "hire_paid" | "hire_delivered"
  | "qa_verdict" | "asset_submitted" | "hire_blocked" | "compose_started"
  | "run_completed" | "run_aborted" | "agent_step" | "error";

export interface WorklogEvent {
  kind: WorklogEventKind;
  at: number;            // epoch ms
  leg?: LegKind;
  message: string;
  data?: Record<string, unknown>;
}

export type RunStatus = "completed" | "partial" | "aborted" | "failed";

export interface RunRecord {
  runId: string;
  status: RunStatus;
  brief: LaunchBrief;
  assets: LaunchAsset[];
  kit?: LaunchKit;
  worklog: WorklogEvent[];
  spentBaseUnits: string;
  startedAt: number;
  endedAt: number;
}
```

- [ ] **Step 2: Write the failing test `src/constants.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { usdToBaseUnits, baseUnitsToUsd, BASE_USDC_ADDRESS, REQUIRED_LEGS } from "./constants.js";

describe("usdToBaseUnits", () => {
  it("converts whole and fractional dollars to 6-decimal base units", () => {
    expect(usdToBaseUnits("2.00")).toBe(2_000_000n);
    expect(usdToBaseUnits("0.10")).toBe(100_000n);
    expect(usdToBaseUnits("0.5")).toBe(500_000n);
    expect(usdToBaseUnits("1")).toBe(1_000_000n);
  });
  it("rejects malformed input naming the bad value", () => {
    expect(() => usdToBaseUnits("abc")).toThrow(/abc/);
    expect(() => usdToBaseUnits("1.2345678")).toThrow(/precision/);
  });
});

describe("baseUnitsToUsd", () => {
  it("formats base units back to a 2-dp dollar string", () => {
    expect(baseUnitsToUsd(100_000n)).toBe("0.10");
    expect(baseUnitsToUsd(2_000_000n)).toBe("2.00");
    expect(baseUnitsToUsd(1_888_624n)).toBe("1.89");
  });
});

describe("constants", () => {
  it("exposes Base mainnet USDC and the three required legs", () => {
    expect(BASE_USDC_ADDRESS.toLowerCase()).toBe("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
    expect(REQUIRED_LEGS).toEqual(["research", "landing_copy", "og_image"]);
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `pnpm exec vitest run src/constants.test.ts`
Expected: FAIL — cannot find module `./constants.js`.

- [ ] **Step 4: Write `src/constants.ts`**

```typescript
import type { LegKind } from "./types.js";

/** Base mainnet USDC (6 decimals). The one allowed on-chain constant. */
export const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const USDC_DECIMALS = 6;

export const DEFAULT_RUN_BUDGET_USDC = "2.00";
export const DEFAULT_LEG_CAP_USDC = "0.60"; // accommodates the $0.50 image leg + headroom
export const REQUIRED_LEGS: LegKind[] = ["research", "landing_copy", "og_image"];

/** Hard backstop against a runaway agent loop (turns = one LLM call + its tool batch). */
export const MAX_TURNS = 24;

const SCALE = 10n ** BigInt(USDC_DECIMALS);

/** Parse a decimal-dollar string to USDC base units. Rejects junk and >6dp precision. */
export function usdToBaseUnits(usd: string): bigint {
  if (!/^\d+(\.\d+)?$/.test(usd)) throw new Error(`Invalid USD amount: ${usd}`);
  const [whole, frac = ""] = usd.split(".");
  if (frac.length > USDC_DECIMALS) throw new Error(`USD amount exceeds ${USDC_DECIMALS}dp precision: ${usd}`);
  const fracPadded = frac.padEnd(USDC_DECIMALS, "0");
  return BigInt(whole) * SCALE + BigInt(fracPadded || "0");
}

/** Format USDC base units to a 2-dp dollar string for display. */
export function baseUnitsToUsd(b: bigint): string {
  const whole = b / SCALE;
  const cents = (b % SCALE) / (SCALE / 100n);
  return `${whole}.${cents.toString().padStart(2, "0")}`;
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `pnpm exec vitest run src/constants.test.ts`
Expected: PASS (5 assertions).

- [ ] **Step 6: Extend `src/config.ts`** — replace the file body with the extended config

```typescript
/**
 * Loads and validates Praeco's runtime configuration from environment variables.
 * Fails fast (naming the offending var) so a misconfigured deploy never reaches
 * a live CAP call with a missing key.
 */
import type { LegKind } from "./types.js";
import { BASE_USDC_ADDRESS, DEFAULT_RUN_BUDGET_USDC, DEFAULT_LEG_CAP_USDC } from "./constants.js";

export interface Config {
  crooApiUrl: string;
  crooWsUrl: string;
  crooSdkKey: string;
  baseRpcUrl: string;
  ollamaApiKey: string;
  ollamaBaseUrl: string;
  praecoAgentId: string;
  praecoAgentWallet: string;
  usdcTokenAddress: string;
  runBudgetUsdc: string;
  legCapUsdc: string;
  preferredServiceIds: Partial<Record<LegKind, string>>;
}

const REQUIRED = [
  "CROO_API_URL",
  "CROO_WS_URL",
  "CROO_SDK_KEY",
  "BASE_RPC_URL",
  "OLLAMA_API_KEY",
  "OLLAMA_BASE_URL",
  "PRAECO_AGENT_ID",
  "PRAECO_AGENT_WALLET",
] as const;

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): Config {
  for (const key of REQUIRED) {
    if (!env[key]) throw new Error(`Missing required env var: ${key}`);
  }
  const preferredServiceIds: Partial<Record<LegKind, string>> = {};
  if (env.SVC_RESEARCH) preferredServiceIds.research = env.SVC_RESEARCH;
  if (env.SVC_LANDING) preferredServiceIds.landing_copy = env.SVC_LANDING;
  if (env.SVC_IMAGE) preferredServiceIds.og_image = env.SVC_IMAGE;
  return {
    crooApiUrl: env.CROO_API_URL!,
    crooWsUrl: env.CROO_WS_URL!,
    crooSdkKey: env.CROO_SDK_KEY!,
    baseRpcUrl: env.BASE_RPC_URL!,
    ollamaApiKey: env.OLLAMA_API_KEY!,
    ollamaBaseUrl: env.OLLAMA_BASE_URL!,
    praecoAgentId: env.PRAECO_AGENT_ID!,
    praecoAgentWallet: env.PRAECO_AGENT_WALLET!,
    usdcTokenAddress: env.USDC_TOKEN_ADDRESS ?? BASE_USDC_ADDRESS,
    runBudgetUsdc: env.RUN_BUDGET_USDC ?? DEFAULT_RUN_BUDGET_USDC,
    legCapUsdc: env.LEG_CAP_USDC ?? DEFAULT_LEG_CAP_USDC,
    preferredServiceIds,
  };
}
```

- [ ] **Step 7: Update `src/config.test.ts`** — extend `fullEnv` and add coverage for the new required vars + defaults

```typescript
import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

const fullEnv = {
  CROO_API_URL: "a",
  CROO_WS_URL: "b",
  CROO_SDK_KEY: "c",
  BASE_RPC_URL: "d",
  OLLAMA_API_KEY: "e",
  OLLAMA_BASE_URL: "f",
  PRAECO_AGENT_ID: "agent-1",
  PRAECO_AGENT_WALLET: "0xee47",
};

describe("loadConfig", () => {
  it("throws, naming the missing var, when a required var is absent", () => {
    expect(() => loadConfig({})).toThrow(/CROO_API_URL/);
  });

  it("throws, naming a specific missing var, when only one is absent", () => {
    const { PRAECO_AGENT_WALLET, ...partial } = fullEnv;
    expect(() => loadConfig(partial)).toThrow(/PRAECO_AGENT_WALLET/);
  });

  it("returns a populated config with defaults applied", () => {
    const cfg = loadConfig(fullEnv);
    expect(cfg.crooApiUrl).toBe("a");
    expect(cfg.praecoAgentId).toBe("agent-1");
    expect(cfg.praecoAgentWallet).toBe("0xee47");
    expect(cfg.usdcTokenAddress.toLowerCase()).toBe("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
    expect(cfg.runBudgetUsdc).toBe("2.00");
    expect(cfg.legCapUsdc).toBe("0.60");
    expect(cfg.preferredServiceIds).toEqual({});
  });

  it("maps SVC_* preferred service ids by leg", () => {
    const cfg = loadConfig({ ...fullEnv, SVC_RESEARCH: "r1", SVC_IMAGE: "i1" });
    expect(cfg.preferredServiceIds).toEqual({ research: "r1", og_image: "i1" });
  });
});
```

- [ ] **Step 8: Update `.env.example`** — append the new vars under a Phase-1 section

```
# --- Praeco agent identity (Phase-0 Task 5) ---
PRAECO_AGENT_ID=ce5362ad-272f-42aa-b656-f4e51796bcaf
PRAECO_AGENT_WALLET=0xee47A5bda206E188a2857F908E5E2E62C7DA7D31

# --- Engine budget (optional; defaults shown) ---
RUN_BUDGET_USDC=2.00
LEG_CAP_USDC=0.60
# USDC_TOKEN_ADDRESS= # defaults to Base mainnet USDC
```

- [ ] **Step 9: Run full suite + typecheck**

Run: `pnpm test:run && pnpm typecheck`
Expected: PASS — config + constants green, no type errors.

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/constants.ts src/constants.test.ts src/config.ts src/config.test.ts .env.example
git commit -S -m "feat(engine): domain contract, constants, and extended config"
```

### Task 2: GLM-5.2 model factory

**Files:**
- Create: `src/llm/model.ts`
- Create: `src/llm/model.test.ts`

**Interfaces:**
- Consumes: nothing (reads `OLLAMA_API_KEY`/`OLLAMA_BASE_URL` via the provider's env auth at call time).
- Produces: `createGlmModels(): { models: MutableModels; model: Model<"openai-completions">; streamFn: StreamFn }` — the configured GLM-5.2 provider, the model handle, and a `streamFn` bound to these models for the agent loop.

- [ ] **Step 1: Write the failing test `src/llm/model.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createGlmModels } from "./model.js";

beforeEach(() => {
  process.env.OLLAMA_API_KEY = "test-key";
});

describe("createGlmModels", () => {
  it("builds the glm-5.2:cloud model and a callable streamFn", () => {
    const { models, model, streamFn } = createGlmModels();
    expect(model.id).toBe("glm-5.2:cloud");
    expect(model.provider).toBe("ollama-cloud");
    expect(models.getModel("ollama-cloud", "glm-5.2:cloud")?.id).toBe("glm-5.2:cloud");
    expect(typeof streamFn).toBe("function");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run src/llm/model.test.ts`
Expected: FAIL — cannot find module `./model.js`.

- [ ] **Step 3: Write `src/llm/model.ts`** (extract the proven wiring from `scripts/llm-smoke.ts`)

```typescript
/**
 * GLM-5.2 (Ollama Cloud, OpenAI-compatible) model factory.
 * Extracted from the proven Phase-0 scripts/llm-smoke.ts wiring. GLM-5.2 is a
 * reasoning model served at https://ollama.com/v1; we register it as a custom
 * provider. compat flags disable the `developer` role and reasoning-effort
 * params that Ollama's endpoint does not accept.
 */
import {
  createModels,
  createProvider,
  envApiKeyAuth,
  type Model,
  type MutableModels,
  type Context,
  type SimpleStreamOptions,
  type Api,
  type AssistantMessageEventStream,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

export type StreamFn = (
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
) => AssistantMessageEventStream;

const glm: Model<"openai-completions"> = {
  id: "glm-5.2:cloud",
  name: "GLM-5.2 (Ollama Cloud)",
  api: "openai-completions",
  provider: "ollama-cloud",
  baseUrl: "https://ollama.com/v1",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 200000,
  maxTokens: 8000,
  compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
} as Model<"openai-completions">;

export function createGlmModels(): {
  models: MutableModels;
  model: Model<"openai-completions">;
  streamFn: StreamFn;
} {
  const provider = createProvider({
    id: "ollama-cloud",
    name: "Ollama Cloud",
    baseUrl: "https://ollama.com/v1",
    auth: { apiKey: envApiKeyAuth("Ollama API key", ["OLLAMA_API_KEY"]) },
    models: [glm],
    api: openAICompletionsApi(),
  });
  const models = createModels();
  models.setProvider(provider);
  const model = models.getModel("ollama-cloud", "glm-5.2:cloud") as Model<"openai-completions">;
  if (!model) throw new Error("Model ollama-cloud/glm-5.2:cloud not found after registration");
  const streamFn: StreamFn = (m, context, options) => models.streamSimple(m, context, options);
  return { models, model, streamFn };
}
```

> Note for the implementer: `MutableModels`, `Context`, `SimpleStreamOptions`, `Api`, `AssistantMessageEventStream` are all exported from `@earendil-works/pi-ai` (verified in its `dist/*.d.ts`). If a name fails to resolve, check `node_modules/@earendil-works/pi-ai/dist/index.d.ts` and adjust the import — do not invent types.

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run src/llm/model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/llm/model.ts src/llm/model.test.ts
git commit -S -m "feat(engine): GLM-5.2 model factory extracted from smoke"
```

### Task 3: LLM facade — robust text + JSON completion

**Files:**
- Create: `src/llm/llm.ts`
- Create: `src/llm/llm.test.ts`

**Interfaces:**
- Consumes: a minimal `{ complete: CompleteFn }` (production passes a one-line adapter `{ complete: (m, c) => models.complete(m, c) }` over Task 2's `models`; tests pass a fake) + the `model` handle.
- Produces:
  - `type CompleteFn = (model: Model<any>, context: { messages: LlmMessage[] }) => Promise<{ content: Array<{ type: string; text?: string }> }>`
  - `interface Llm { completeText(prompt: string): Promise<string>; completeJson<T>(prompt: string, schema: ZodType<T>): Promise<T>; }`
  - `createLlm(completer: { complete: CompleteFn }, model: Model<any>): Llm`
  - `extractFirstJson(raw: string): string` (exported for testing)

- [ ] **Step 1: Write the failing test `src/llm/llm.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createLlm, extractFirstJson } from "./llm.js";

// A fake completer returns scripted assistant content, ignoring inputs.
function fakeCompleter(texts: string[]) {
  let i = 0;
  return {
    complete: async () => ({ content: [{ type: "text", text: texts[Math.min(i++, texts.length - 1)] }] }),
  };
}
const model = { id: "glm-5.2:cloud" } as any;

describe("extractFirstJson", () => {
  it("pulls the first balanced JSON object out of reasoning noise", () => {
    expect(extractFirstJson('thinking... {"a":1} trailing')).toBe('{"a":1}');
    expect(extractFirstJson('{"a":{"b":[1,2]}} extra')).toBe('{"a":{"b":[1,2]}}');
  });
  it("throws when no object is present", () => {
    expect(() => extractFirstJson("no json here")).toThrow(/no JSON/i);
  });
});

describe("createLlm.completeText", () => {
  it("concatenates text blocks and trims", async () => {
    const llm = createLlm(fakeCompleter(["  PRAECO ONLINE  "]), model);
    expect(await llm.completeText("hi")).toBe("PRAECO ONLINE");
  });
});

describe("createLlm.completeJson", () => {
  it("parses and validates JSON against a zod schema", async () => {
    const llm = createLlm(fakeCompleter(['reason {"product":"Streaky","audience":"builders"}']), model);
    const out = await llm.completeJson("brief?", z.object({ product: z.string(), audience: z.string() }));
    expect(out).toEqual({ product: "Streaky", audience: "builders" });
  });

  it("repairs once when the first response is unparseable, then validates", async () => {
    const llm = createLlm(fakeCompleter(["totally not json", '{"product":"X","audience":"Y"}']), model);
    const out = await llm.completeJson("brief?", z.object({ product: z.string(), audience: z.string() }));
    expect(out.product).toBe("X");
  });

  it("throws an actionable error when both attempts fail validation", async () => {
    const llm = createLlm(fakeCompleter(["nope", "still nope"]), model);
    await expect(
      llm.completeJson("brief?", z.object({ product: z.string() })),
    ).rejects.toThrow(/failed to produce valid JSON/i);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run src/llm/llm.test.ts`
Expected: FAIL — cannot find module `./llm.js`.

- [ ] **Step 3: Write `src/llm/llm.ts`**

```typescript
/**
 * High-level LLM facade over a pi-ai Models instance. GLM-5.2 is a reasoning
 * model that emits prose/thinking around its answer, so completeJson extracts
 * the first balanced JSON object, validates it with zod, and retries once with
 * a stricter instruction on failure. All downstream modules depend on this
 * narrow interface, which makes them trivial to unit-test with a fake.
 */
import type { Model } from "@earendil-works/pi-ai";
import type { ZodType } from "zod";

export interface LlmMessage {
  role: "user";
  content: string;
  timestamp: number;
}

export type CompleteFn = (
  model: Model<any>,
  context: { messages: LlmMessage[] },
) => Promise<{ content: Array<{ type: string; text?: string }> }>;

export interface Llm {
  completeText(prompt: string): Promise<string>;
  completeJson<T>(prompt: string, schema: ZodType<T>): Promise<T>;
}

/** Extract the first balanced top-level JSON object from arbitrary model text. */
export function extractFirstJson(raw: string): string {
  const start = raw.indexOf("{");
  if (start === -1) throw new Error("no JSON object found in model output");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  throw new Error("no balanced JSON object found in model output");
}

const textOf = (content: Array<{ type: string; text?: string }>): string =>
  content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");

export function createLlm(completer: { complete: CompleteFn }, model: Model<any>): Llm {
  const ask = async (prompt: string): Promise<string> => {
    const res = await completer.complete(model, {
      messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
    });
    return textOf(res.content).trim();
  };

  return {
    async completeText(prompt) {
      return ask(prompt);
    },
    async completeJson<T>(prompt: string, schema: ZodType<T>): Promise<T> {
      const attempt = async (p: string): Promise<T | null> => {
        const raw = await ask(p);
        try {
          return schema.parse(JSON.parse(extractFirstJson(raw)));
        } catch {
          return null;
        }
      };
      const first = await attempt(prompt);
      if (first !== null) return first;
      const strict =
        `${prompt}\n\nIMPORTANT: Respond with ONLY a single valid JSON object and no other text, ` +
        `no markdown fences, no commentary. The object must match the requested shape exactly.`;
      const second = await attempt(strict);
      if (second !== null) return second;
      throw new Error("LLM failed to produce valid JSON matching the schema after one repair attempt");
    },
  };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run src/llm/llm.test.ts`
Expected: PASS (7 assertions across 5 tests).

- [ ] **Step 5: Run full suite + typecheck, then commit**

```bash
pnpm test:run && pnpm typecheck
git add src/llm/llm.ts src/llm/llm.test.ts
git commit -S -m "feat(engine): LLM facade with robust JSON extraction + repair"
```

---

## Stage B — CAP primitives (wallet gate, discovery, guarded hire)

### Task 4: USDC wallet balance + funding gate

**Files:**
- Create: `src/cap/wallet.ts`
- Create: `src/cap/wallet.test.ts`

**Interfaces:**
- Consumes: `baseUnitsToUsd` (Task 1).
- Produces:
  - `type FetchFn = typeof fetch`
  - `getUsdcBalance(rpcUrl: string, wallet: string, tokenAddr: string, fetchImpl?: FetchFn): Promise<bigint>` — raw `eth_call` to `balanceOf(wallet)`, no new deps.
  - `assertFunded(rpcUrl: string, wallet: string, tokenAddr: string, requiredBaseUnits: bigint, fetchImpl?: FetchFn): Promise<void>` — throws the actionable "fund the agent wallet (gate #1)" error when short.

- [ ] **Step 1: Write the failing test `src/cap/wallet.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { getUsdcBalance, assertFunded } from "./wallet.js";

// 0x1e8480 = 2_000_000 base units = 2.00 USDC
const okFetch = (async () =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x00000000000000000000000000000000000000000000000000000000001e8480" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as unknown as typeof fetch;

describe("getUsdcBalance", () => {
  it("decodes the eth_call balanceOf result to base units", async () => {
    const bal = await getUsdcBalance("https://rpc", "0xee47A5bda206E188a2857F908E5E2E62C7DA7D31", "0x8335", okFetch);
    expect(bal).toBe(2_000_000n);
  });
});

describe("assertFunded", () => {
  it("passes when balance covers the requirement", async () => {
    await expect(assertFunded("https://rpc", "0xee47", "0x8335", 100_000n, okFetch)).resolves.toBeUndefined();
  });
  it("throws an actionable gate-#1 error when short", async () => {
    await expect(assertFunded("https://rpc", "0xee47", "0x8335", 5_000_000n, okFetch)).rejects.toThrow(/fund the agent wallet/i);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run src/cap/wallet.test.ts`
Expected: FAIL — cannot find module `./wallet.js`.

- [ ] **Step 3: Write `src/cap/wallet.ts`**

```typescript
/**
 * On-chain USDC balance for the agent-wallet funding gate (findings #1: an empty
 * agent wallet silently hangs every hire). Uses a raw JSON-RPC eth_call to the
 * ERC-20 balanceOf — no viem/ethers dependency.
 */
import { baseUnitsToUsd } from "../constants.js";

export type FetchFn = typeof fetch;

const BALANCE_OF_SELECTOR = "0x70a08231"; // balanceOf(address)

export async function getUsdcBalance(
  rpcUrl: string,
  wallet: string,
  tokenAddr: string,
  fetchImpl: FetchFn = fetch,
): Promise<bigint> {
  const addr = wallet.replace(/^0x/, "").toLowerCase().padStart(64, "0");
  const data = BALANCE_OF_SELECTOR + addr;
  const res = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: tokenAddr, data }, "latest"],
    }),
  });
  if (!res.ok) throw new Error(`RPC eth_call failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as { result?: string; error?: { message?: string } };
  if (json.error) throw new Error(`RPC eth_call error: ${json.error.message ?? "unknown"}`);
  if (!json.result || json.result === "0x") throw new Error(`RPC eth_call returned no balance for ${wallet}`);
  return BigInt(json.result);
}

export async function assertFunded(
  rpcUrl: string,
  wallet: string,
  tokenAddr: string,
  requiredBaseUnits: bigint,
  fetchImpl: FetchFn = fetch,
): Promise<void> {
  const bal = await getUsdcBalance(rpcUrl, wallet, tokenAddr, fetchImpl);
  if (bal < requiredBaseUnits) {
    throw new Error(
      `Agent wallet ${wallet} holds ${baseUnitsToUsd(bal)} USDC but needs ${baseUnitsToUsd(requiredBaseUnits)} — ` +
        `fund the agent wallet via agent.croo.network → My Agents → Top Up (gate #1).`,
    );
  }
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run src/cap/wallet.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cap/wallet.ts src/cap/wallet.test.ts
git commit -S -m "feat(engine): on-chain USDC balance + agent-wallet funding gate"
```

### Task 5: Marketplace discovery + reputation ranking

**Files:**
- Create: `src/cap/discovery.ts`
- Create: `src/cap/discovery.test.ts`

**Interfaces:**
- Consumes: `ServiceCandidate`, `RequirementField` (Task 1); `FetchFn` (Task 4).
- Produces (public REST base = `{apiUrl}/backend/v1/public`):
  - `searchServices(apiUrl: string, query: string, fetchImpl?: FetchFn): Promise<ServiceHit[]>` where `interface ServiceHit { serviceId: string; agentId: string; agentName: string; title: string; priceBaseUnits: string; orders7d?: number }`
  - `getAgent(apiUrl: string, agentId: string, fetchImpl?: FetchFn): Promise<AgentRecord>` (reputation + `services[]` with `requirementSchema`)
  - `resolveCandidate(apiUrl: string, serviceId: string, agentId: string, fetchImpl?: FetchFn): Promise<ServiceCandidate>` (merges a service with its agent's schema + reputation)
  - `rankCandidates(candidates: ServiceCandidate[], opts?: { preferredServiceId?: string }): ServiceCandidate[]` (preferred first, then reputation, then cheapest)

> The public-REST JSON field names below come from the Phase-0 findings (`docs/superpowers/specs/2026-06-27-phase0-findings.md` §Discovery and §2). Parsing is defensive (missing reputation → 0); the `engine:smoke` (Task 17) confirms shapes against the live API and any drift is fixed here.

- [ ] **Step 1: Write the failing test `src/cap/discovery.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { searchServices, resolveCandidate, rankCandidates } from "./discovery.js";
import type { ServiceCandidate } from "../types.js";

function jsonFetch(map: Record<string, unknown>): typeof fetch {
  return (async (url: string) => {
    const key = Object.keys(map).find((k) => String(url).includes(k));
    if (!key) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(map[key]), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

describe("searchServices", () => {
  it("maps public search hits to ServiceHit[]", async () => {
    const f = jsonFetch({
      "/public/search": [
        { serviceId: "s1", agentId: "a1", agentName: "OpsPilot", title: "SEO audit", price: "100000", orders7d: 42 },
      ],
    });
    const hits = await searchServices("https://api.croo.network", "seo", f);
    expect(hits[0]).toMatchObject({ serviceId: "s1", agentId: "a1", priceBaseUnits: "100000", orders7d: 42 });
  });
});

describe("resolveCandidate", () => {
  it("merges a service with its agent reputation + requirementSchema", async () => {
    const f = jsonFetch({
      "/public/agents/a1": {
        agentId: "a1",
        name: "OpsPilot",
        completedOrders: 2754,
        completionRate: 0.9996,
        avgDeliveryText: "~60s",
        onlineStatus: "online",
        services: [
          {
            serviceId: "s1",
            title: "seo_rules_audit",
            price: "100000",
            requirementType: "schema",
            requirementSchema: [{ name: "title", type: "string", required: true }],
          },
        ],
      },
    });
    const c = await resolveCandidate("https://api.croo.network", "s1", "a1", f);
    expect(c.completionRate).toBeCloseTo(0.9996);
    expect(c.requirementSchema).toEqual([{ name: "title", type: "string", required: true }]);
  });
});

describe("rankCandidates", () => {
  const mk = (over: Partial<ServiceCandidate>): ServiceCandidate => ({
    serviceId: "s", agentId: "a", agentName: "n", title: "t", priceBaseUnits: "100000",
    requirementType: "schema", requirementSchema: [], completedOrders: 0, completionRate: 0, ...over,
  });
  it("puts the preferred service first, then ranks by reputation, then price", () => {
    const a = mk({ serviceId: "pref", completedOrders: 1, completionRate: 0.5 });
    const b = mk({ serviceId: "proven", completedOrders: 2754, completionRate: 0.9996 });
    const c = mk({ serviceId: "stub", completedOrders: 0, completionRate: 0 });
    const ranked = rankCandidates([c, a, b], { preferredServiceId: "pref" });
    expect(ranked.map((x) => x.serviceId)).toEqual(["pref", "proven", "stub"]);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run src/cap/discovery.test.ts`
Expected: FAIL — cannot find module `./discovery.js`.

- [ ] **Step 3: Write `src/cap/discovery.ts`**

```typescript
/**
 * CAP marketplace discovery against the public REST surface (no auth):
 *   {apiUrl}/backend/v1/public/{search?q= | agents/{id}}
 * The SDK has no marketplace search, so this is a thin fetch client. Input
 * schemas live on the AGENT record (findings #2), not on services, so a full
 * candidate is a service merged with its agent's reputation + requirementSchema.
 */
import type { FetchFn } from "./wallet.js";
import type { ServiceCandidate, RequirementField } from "../types.js";

export interface ServiceHit {
  serviceId: string;
  agentId: string;
  agentName: string;
  title: string;
  priceBaseUnits: string;
  orders7d?: number;
}

export interface AgentRecord {
  agentId: string;
  name: string;
  completedOrders: number;
  completionRate: number;
  avgDeliveryText?: string;
  onlineStatus?: string;
  services: Array<{
    serviceId: string;
    title: string;
    price: string;
    requirementType: string;
    requirementSchema?: RequirementField[];
    requirementText?: string;
  }>;
}

const base = (apiUrl: string) => `${apiUrl.replace(/\/$/, "")}/backend/v1/public`;

async function getJson<T>(url: string, fetchImpl: FetchFn): Promise<T> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`CAP public GET ${url} failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function searchServices(apiUrl: string, query: string, fetchImpl: FetchFn = fetch): Promise<ServiceHit[]> {
  const raw = await getJson<any[]>(`${base(apiUrl)}/search?q=${encodeURIComponent(query)}`, fetchImpl);
  return (Array.isArray(raw) ? raw : []).map((s) => ({
    serviceId: String(s.serviceId ?? s.id),
    agentId: String(s.agentId),
    agentName: String(s.agentName ?? s.name ?? ""),
    title: String(s.title ?? ""),
    priceBaseUnits: String(s.price ?? s.priceBaseUnits ?? "0"),
    orders7d: typeof s.orders7d === "number" ? s.orders7d : undefined,
  }));
}

export async function getAgent(apiUrl: string, agentId: string, fetchImpl: FetchFn = fetch): Promise<AgentRecord> {
  const a = await getJson<any>(`${base(apiUrl)}/agents/${encodeURIComponent(agentId)}`, fetchImpl);
  return {
    agentId: String(a.agentId ?? agentId),
    name: String(a.name ?? a.agentName ?? ""),
    completedOrders: Number(a.completedOrders ?? 0),
    completionRate: Number(a.completionRate ?? 0),
    avgDeliveryText: a.avgDeliveryText ? String(a.avgDeliveryText) : undefined,
    onlineStatus: a.onlineStatus ? String(a.onlineStatus) : undefined,
    services: Array.isArray(a.services) ? a.services : [],
  };
}

export async function resolveCandidate(
  apiUrl: string,
  serviceId: string,
  agentId: string,
  fetchImpl: FetchFn = fetch,
): Promise<ServiceCandidate> {
  const agent = await getAgent(apiUrl, agentId, fetchImpl);
  const svc = agent.services.find((s) => s.serviceId === serviceId);
  if (!svc) throw new Error(`service ${serviceId} not found on agent ${agentId}`);
  return {
    serviceId,
    agentId,
    agentName: agent.name,
    title: svc.title,
    priceBaseUnits: String(svc.price ?? "0"),
    requirementType: svc.requirementType,
    requirementSchema: Array.isArray(svc.requirementSchema) ? svc.requirementSchema : [],
    requirementText: svc.requirementText,
    completedOrders: agent.completedOrders,
    completionRate: agent.completionRate,
    avgDeliveryText: agent.avgDeliveryText,
    onlineStatus: agent.onlineStatus,
  };
}

/** Reputation-weighted ranking: pinned preferred first, then proven, then cheapest. */
export function rankCandidates(
  candidates: ServiceCandidate[],
  opts: { preferredServiceId?: string } = {},
): ServiceCandidate[] {
  const score = (c: ServiceCandidate) => c.completionRate * Math.log10(c.completedOrders + 1);
  return [...candidates].sort((a, b) => {
    if (opts.preferredServiceId) {
      if (a.serviceId === opts.preferredServiceId) return -1;
      if (b.serviceId === opts.preferredServiceId) return 1;
    }
    const s = score(b) - score(a);
    if (s !== 0) return s;
    return Number(BigInt(a.priceBaseUnits) - BigInt(b.priceBaseUnits));
  });
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run src/cap/discovery.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cap/discovery.ts src/cap/discovery.test.ts
git commit -S -m "feat(engine): CAP marketplace discovery + reputation ranking"
```

### Task 6: Guarded single-hire sequence

**Files:**
- Create: `src/cap/hire.ts`
- Create: `src/cap/hire.test.ts`

**Interfaces:**
- Consumes: `LegKind`, `HireResult`, `Deliverable`, `WorklogEvent` (Task 1).
- Produces:
  - `interface CapBuyer { negotiateOrder; getNegotiation; listOrders; getOrder; payOrder; getDelivery }` (structural subset the real `AgentClient` satisfies).
  - `interface HireParams { leg; serviceId; agentId; agentName; requirements: Record<string, unknown>; priceCapBaseUnits: bigint; assertPayable?: (priceBaseUnits: bigint) => Promise<void> }`
  - `interface HirePollOpts { negotiationPolls?; negotiationDelayMs?; deliveryPolls?; deliveryDelayMs?; sleep? }`
  - `hireSpecialist(client: CapBuyer, p: HireParams, onEvent: (e: WorklogEvent) => void, opts?: HirePollOpts): Promise<HireResult>`

- [ ] **Step 1: Write the failing test `src/cap/hire.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { hireSpecialist, type CapBuyer } from "./hire.js";

const noSleep = async () => {};
const fast = { negotiationPolls: 3, deliveryPolls: 3, sleep: noSleep };
const base = {
  leg: "research" as const, serviceId: "s1", agentId: "a1", agentName: "OpsPilot",
  requirements: { title: "X" }, priceCapBaseUnits: 200_000n,
};

function happyClient(): CapBuyer {
  return {
    negotiateOrder: vi.fn(async () => ({ negotiationId: "n1" })),
    getNegotiation: vi.fn(async () => ({ status: "pending" })),
    listOrders: vi.fn(async () => [{ orderId: "o1", negotiationId: "n1", price: "100000", status: "created" }]),
    getOrder: vi.fn(async () => ({ status: "completed", deliverTxHash: "0xdeliver" })),
    payOrder: vi.fn(async () => ({ txHash: "0xpay" })),
    getDelivery: vi.fn(async () => ({ deliverableType: "schema", deliverableSchema: '{"total_score":48}', contentHash: "0xhash" })),
  };
}

describe("hireSpecialist (happy path)", () => {
  it("negotiates, pays once, and returns the delivered result with provenance", async () => {
    const client = happyClient();
    const events: string[] = [];
    const res = await hireSpecialist(client, base, (e) => events.push(e.kind), fast);
    expect(client.payOrder).toHaveBeenCalledTimes(1);
    expect(res.orderId).toBe("o1");
    expect(res.payTxHash).toBe("0xpay");
    expect(res.basescanPayUrl).toContain("0xpay");
    expect((res.deliverable.schema as any).total_score).toBe(48);
    expect(events).toEqual(["hire_negotiating", "hire_order_created", "hire_paid", "hire_delivered"]);
  });
});

describe("hireSpecialist (guards)", () => {
  it("never pays when the negotiation is rejected", async () => {
    const client = happyClient();
    client.getNegotiation = vi.fn(async () => ({ status: "rejected", rejectReason: "busy" }));
    await expect(hireSpecialist(client, base, () => {}, fast)).rejects.toThrow(/busy/);
    expect(client.payOrder).not.toHaveBeenCalled();
  });

  it("never pays when no order is created in the poll window (empty-wallet hang)", async () => {
    const client = happyClient();
    client.listOrders = vi.fn(async () => []);
    await expect(hireSpecialist(client, base, () => {}, fast)).rejects.toThrow(/no order created/i);
    expect(client.payOrder).not.toHaveBeenCalled();
  });

  it("never pays when the quoted price exceeds the per-leg cap", async () => {
    const client = happyClient();
    client.listOrders = vi.fn(async () => [{ orderId: "o1", negotiationId: "n1", price: "5000000", status: "created" }]);
    await expect(hireSpecialist(client, { ...base, priceCapBaseUnits: 200_000n }, () => {}, fast)).rejects.toThrow(/exceeds.*cap/i);
    expect(client.payOrder).not.toHaveBeenCalled();
  });

  it("runs assertPayable before paying and aborts (no pay) if it throws", async () => {
    const client = happyClient();
    const assertPayable = vi.fn(async () => { throw new Error("insufficient budget"); });
    await expect(hireSpecialist(client, { ...base, assertPayable }, () => {}, fast)).rejects.toThrow(/insufficient budget/);
    expect(assertPayable).toHaveBeenCalledOnce();
    expect(client.payOrder).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run src/cap/hire.test.ts`
Expected: FAIL — cannot find module `./hire.js`.

- [ ] **Step 3: Write `src/cap/hire.ts`** (the proven Phase-0 sequence, parameterized + guarded)

```typescript
/**
 * One guarded CAP hire: negotiate → poll for provider accept → (price-cap +
 * payability checks) → pay USDC → poll for delivery. Poll-based, never reacts
 * to raw WS events (they replay on connect). Pays at most once. The proven
 * Phase-0 flow (scripts/cap-hire.ts), generalized for the engine.
 */
import type { LegKind, HireResult, Deliverable, WorklogEvent } from "../types.js";

export interface CapBuyer {
  negotiateOrder(req: { serviceId: string; requirements?: string }): Promise<{ negotiationId: string }>;
  getNegotiation(id: string): Promise<{ status: string; rejectReason?: string }>;
  listOrders(opts: { role: string; page: number; pageSize: number }): Promise<Array<{ orderId: string; negotiationId: string; price: string; status: string }>>;
  getOrder(id: string): Promise<{ status: string; deliverTxHash?: string }>;
  payOrder(id: string): Promise<{ txHash: string }>;
  getDelivery(id: string): Promise<{ deliverableType: string; deliverableText?: string; deliverableSchema?: string; contentHash: string }>;
}

export interface HireParams {
  leg: LegKind;
  serviceId: string;
  agentId: string;
  agentName: string;
  requirements: Record<string, unknown>;
  priceCapBaseUnits: bigint;
  assertPayable?: (priceBaseUnits: bigint) => Promise<void>;
}

export interface HirePollOpts {
  negotiationPolls?: number;
  negotiationDelayMs?: number;
  deliveryPolls?: number;
  deliveryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const basescan = (tx: string) => `https://basescan.org/tx/${tx}`;

function parseSchema(raw?: string): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function hireSpecialist(
  client: CapBuyer,
  p: HireParams,
  onEvent: (e: WorklogEvent) => void,
  opts: HirePollOpts = {},
): Promise<HireResult> {
  const sleep = opts.sleep ?? defaultSleep;
  const negPolls = opts.negotiationPolls ?? 40;
  const negDelay = opts.negotiationDelayMs ?? 1500;
  const delPolls = opts.deliveryPolls ?? 60;
  const delDelay = opts.deliveryDelayMs ?? 3000;
  const emit = (kind: WorklogEvent["kind"], message: string, data?: Record<string, unknown>) =>
    onEvent({ kind, at: Date.now(), leg: p.leg, message, data });

  // 1. Negotiate.
  const neg = await client.negotiateOrder({ serviceId: p.serviceId, requirements: JSON.stringify(p.requirements) });
  emit("hire_negotiating", `negotiating ${p.agentName} (${p.serviceId})`, { negotiationId: neg.negotiationId });

  // 2. Poll until the provider accepts (order created) or rejects.
  let order: { orderId: string; negotiationId: string; price: string; status: string } | undefined;
  for (let i = 0; i < negPolls && !order; i++) {
    await sleep(negDelay);
    const n = await client.getNegotiation(neg.negotiationId);
    if (n.status === "rejected") throw new Error(`negotiation rejected by ${p.agentName}: ${n.rejectReason ?? "no reason"}`);
    const orders = await client.listOrders({ role: "buyer", page: 1, pageSize: 20 });
    order = orders.find((o) => o.negotiationId === neg.negotiationId);
  }
  if (!order) throw new Error(`no order created by ${p.agentName} within the poll window — is the agent wallet funded? (gate #1)`);

  const priceBaseUnits = BigInt(order.price);
  emit("hire_order_created", `order ${order.orderId} created at ${order.price} base units`, { orderId: order.orderId, price: order.price });

  // 3. Money guards — refuse to pay above the per-leg cap; honor caller payability gate.
  if (priceBaseUnits > p.priceCapBaseUnits) {
    throw new Error(`order price ${order.price} exceeds per-leg cap ${p.priceCapBaseUnits} — not paying`);
  }
  if (p.assertPayable) await p.assertPayable(priceBaseUnits);

  // 4. Pay (LIVE USDC settlement on Base) — exactly once.
  const pay = await client.payOrder(order.orderId);
  emit("hire_paid", `paid ${p.agentName} — ${basescan(pay.txHash)}`, { orderId: order.orderId, payTxHash: pay.txHash });

  // 5. Poll for delivery.
  for (let i = 0; i < delPolls; i++) {
    await sleep(delDelay);
    const o = await client.getOrder(order.orderId);
    if (o.deliverTxHash || o.status === "completed") {
      const d = await client.getDelivery(order.orderId);
      const deliverable: Deliverable = {
        type: d.deliverableType,
        text: d.deliverableText || undefined,
        schema: parseSchema(d.deliverableSchema),
        contentHash: d.contentHash,
      };
      emit("hire_delivered", `delivered by ${p.agentName} (hash ${d.contentHash})`, { orderId: order.orderId, contentHash: d.contentHash });
      return {
        leg: p.leg,
        serviceId: p.serviceId,
        agentId: p.agentId,
        agentName: p.agentName,
        orderId: order.orderId,
        chainOrderId: order.orderId,
        priceBaseUnits: order.price,
        payTxHash: pay.txHash,
        deliverTxHash: o.deliverTxHash ?? "",
        deliverable,
        basescanPayUrl: basescan(pay.txHash),
        basescanDeliverUrl: o.deliverTxHash ? basescan(o.deliverTxHash) : "",
      };
    }
  }
  throw new Error(`${p.agentName} accepted + was paid (order ${order.orderId}) but did not deliver within the poll window`);
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run src/cap/hire.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run full suite + typecheck, then commit**

```bash
pnpm test:run && pnpm typecheck
git add src/cap/hire.ts src/cap/hire.test.ts
git commit -S -m "feat(engine): guarded single-hire sequence (negotiate→pay→deliver)"
```

---

## Stage C — Engine intelligence (budget, provenance, QA, intake, compose)

### Task 7: Budget guard

**Files:**
- Create: `src/engine/budget.ts`
- Create: `src/engine/budget.test.ts`

**Interfaces:**
- Produces: `class BudgetGuard` — `constructor(totalBaseUnits: bigint, legCapBaseUnits: bigint)`; `get spent(): bigint`; `remaining(): bigint`; `legCap(): bigint`; `exceedsLegCap(amount): boolean`; `canAfford(amount): boolean`; `commit(amount): void` (throws when over leg cap or run budget).

- [ ] **Step 1: Write the failing test `src/engine/budget.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { BudgetGuard } from "./budget.js";

describe("BudgetGuard", () => {
  it("affords within the per-leg cap and the run total", () => {
    const g = new BudgetGuard(2_000_000n, 600_000n);
    expect(g.canAfford(100_000n)).toBe(true);
    expect(g.canAfford(700_000n)).toBe(false); // over leg cap
  });

  it("accumulates committed spend and reports remaining", () => {
    const g = new BudgetGuard(2_000_000n, 600_000n);
    g.commit(100_000n);
    g.commit(500_000n);
    expect(g.spent).toBe(600_000n);
    expect(g.remaining()).toBe(1_400_000n);
  });

  it("throws naming the leg cap when a single amount is too large", () => {
    const g = new BudgetGuard(2_000_000n, 600_000n);
    expect(() => g.commit(700_000n)).toThrow(/per-leg cap/);
  });

  it("throws when cumulative spend would exceed the run budget", () => {
    const g = new BudgetGuard(1_000_000n, 600_000n);
    g.commit(600_000n);
    expect(() => g.commit(500_000n)).toThrow(/run budget/);
    expect(g.spent).toBe(600_000n); // unchanged after the rejected commit
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run src/engine/budget.test.ts`
Expected: FAIL — cannot find module `./budget.js`.

- [ ] **Step 3: Write `src/engine/budget.ts`**

```typescript
/**
 * Hard money invariant for a run. Two caps: a per-leg cap (a single hire's
 * price) and a run total (cumulative spend). The agent loop's beforeToolCall
 * guard consults this before any hire; commit() is called once a hire is
 * authorized. All amounts are USDC base units (bigint).
 */
export class BudgetGuard {
  private committed = 0n;

  constructor(
    private readonly totalBaseUnits: bigint,
    private readonly legCapBaseUnits: bigint,
  ) {}

  get spent(): bigint {
    return this.committed;
  }

  remaining(): bigint {
    return this.totalBaseUnits - this.committed;
  }

  legCap(): bigint {
    return this.legCapBaseUnits;
  }

  exceedsLegCap(amount: bigint): boolean {
    return amount > this.legCapBaseUnits;
  }

  canAfford(amount: bigint): boolean {
    return !this.exceedsLegCap(amount) && this.committed + amount <= this.totalBaseUnits;
  }

  commit(amount: bigint): void {
    if (this.exceedsLegCap(amount)) {
      throw new Error(`hire amount ${amount} exceeds per-leg cap ${this.legCapBaseUnits}`);
    }
    if (this.committed + amount > this.totalBaseUnits) {
      throw new Error(`hire amount ${amount} exceeds remaining run budget ${this.remaining()}`);
    }
    this.committed += amount;
  }
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run src/engine/budget.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/budget.ts src/engine/budget.test.ts
git commit -S -m "feat(engine): BudgetGuard with per-leg + run-total caps"
```

### Task 8: Provenance cards + deliverable/image extraction

**Files:**
- Create: `src/engine/provenance.ts`
- Create: `src/engine/provenance.test.ts`

**Interfaces:**
- Consumes: `Deliverable`, `HireResult`, `ProvenanceCard` (Task 1); `baseUnitsToUsd` (Task 1).
- Produces:
  - `deliverableToText(d: Deliverable): string` (used by QA + compose)
  - `extractImageRef(d: Deliverable): string` (URL if present, else `hash:<contentHash>`)
  - `toProvenanceCard(hire: HireResult): ProvenanceCard`

- [ ] **Step 1: Write the failing test `src/engine/provenance.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { deliverableToText, extractImageRef, toProvenanceCard } from "./provenance.js";
import type { HireResult } from "../types.js";

describe("deliverableToText", () => {
  it("prefers text, falls back to stringified schema, else empty", () => {
    expect(deliverableToText({ type: "text", text: "hello", contentHash: "0x" })).toBe("hello");
    expect(deliverableToText({ type: "schema", schema: { a: 1 }, contentHash: "0x" })).toBe('{"a":1}');
    expect(deliverableToText({ type: "text", contentHash: "0x" })).toBe("");
  });
});

describe("extractImageRef", () => {
  it("returns a direct URL from text", () => {
    expect(extractImageRef({ type: "text", text: "https://cdn/img.png", contentHash: "0x" })).toBe("https://cdn/img.png");
  });
  it("finds a url-ish field inside a schema deliverable", () => {
    expect(extractImageRef({ type: "schema", schema: { imageUrl: "https://cdn/og.png" }, contentHash: "0x" })).toBe("https://cdn/og.png");
    expect(extractImageRef({ type: "schema", schema: { url: "https://cdn/u.png" }, contentHash: "0x" })).toBe("https://cdn/u.png");
  });
  it("falls back to a content-hash reference when no URL is present", () => {
    expect(extractImageRef({ type: "schema", schema: { foo: "bar" }, contentHash: "0xabc" })).toBe("hash:0xabc");
  });
});

describe("toProvenanceCard", () => {
  it("maps a hire result to a provenance card with a dollar amount", () => {
    const hire = {
      leg: "research", serviceId: "s", agentId: "a", agentName: "OpsPilot",
      orderId: "o", chainOrderId: "c", priceBaseUnits: "100000", payTxHash: "0xpay",
      deliverTxHash: "0xd", deliverable: { type: "text", contentHash: "0xhash" },
      basescanPayUrl: "https://basescan.org/tx/0xpay", basescanDeliverUrl: "https://basescan.org/tx/0xd",
    } as HireResult;
    const card = toProvenanceCard(hire);
    expect(card).toMatchObject({ leg: "research", agentName: "OpsPilot", amountUsd: "0.10", contentHash: "0xhash", payTxHash: "0xpay", basescanUrl: "https://basescan.org/tx/0xpay" });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run src/engine/provenance.test.ts`
Expected: FAIL — cannot find module `./provenance.js`.

- [ ] **Step 3: Write `src/engine/provenance.ts`**

```typescript
/**
 * Reading deliverables and minting provenance cards. extractImageRef defends
 * against the (Phase-1-unknown) image-provider deliverable shape: it surfaces a
 * direct URL when one is present in the text or a url-ish schema field, and
 * otherwise records a verifiable content-hash reference.
 */
import type { Deliverable, HireResult, ProvenanceCard } from "../types.js";
import { baseUnitsToUsd } from "../constants.js";

export function deliverableToText(d: Deliverable): string {
  if (d.text && d.text.trim()) return d.text;
  if (d.schema !== undefined) return typeof d.schema === "string" ? d.schema : JSON.stringify(d.schema);
  return "";
}

const URL_FIELDS = ["imageUrl", "image_url", "url", "image", "ogImage", "og_image", "link"];

export function extractImageRef(d: Deliverable): string {
  if (d.text && /^https?:\/\//i.test(d.text.trim())) return d.text.trim();
  if (d.schema && typeof d.schema === "object") {
    const obj = d.schema as Record<string, unknown>;
    for (const f of URL_FIELDS) {
      const v = obj[f];
      if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
    }
  }
  return `hash:${d.contentHash}`;
}

export function toProvenanceCard(hire: HireResult): ProvenanceCard {
  return {
    leg: hire.leg,
    agentId: hire.agentId,
    agentName: hire.agentName,
    amountUsd: baseUnitsToUsd(BigInt(hire.priceBaseUnits)),
    contentHash: hire.deliverable.contentHash,
    payTxHash: hire.payTxHash,
    basescanUrl: hire.basescanPayUrl,
  };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run src/engine/provenance.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/provenance.ts src/engine/provenance.test.ts
git commit -S -m "feat(engine): provenance cards + deliverable/image extraction"
```

### Task 9: QA critic

**Files:**
- Create: `src/engine/qa.ts`
- Create: `src/engine/qa.test.ts`

**Interfaces:**
- Consumes: `Llm` (Task 3); `LaunchBrief`, `LegKind`, `Deliverable`, `QaVerdict` (Task 1); `deliverableToText` (Task 8).
- Produces: `reviewDeliverable(llm: Llm, brief: LaunchBrief, leg: LegKind, deliverable: Deliverable): Promise<QaVerdict>`; `qaVerdictSchema` (zod, exported for reuse in tools).

- [ ] **Step 1: Write the failing test `src/engine/qa.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { reviewDeliverable } from "./qa.js";
import type { Llm } from "../llm/llm.js";
import type { LaunchBrief } from "../types.js";

const brief: LaunchBrief = { product: "Streaky", audience: "builders", features: ["streaks"], tone: "playful", oneLiner: "Track habits." };

function fakeLlm(verdict: unknown): Llm {
  return {
    completeText: vi.fn(async () => ""),
    completeJson: vi.fn(async () => verdict) as Llm["completeJson"],
  };
}

describe("reviewDeliverable", () => {
  it("returns the critic verdict and feeds the deliverable + brief into the prompt", async () => {
    const llm = fakeLlm({ action: "accept", reason: "on-brief", score: 82 });
    const verdict = await reviewDeliverable(llm, brief, "landing_copy", { type: "text", text: "Great copy about habit streaks", contentHash: "0x" });
    expect(verdict).toEqual({ action: "accept", reason: "on-brief", score: 82 });
    const prompt = (llm.completeJson as any).mock.calls[0][0] as string;
    expect(prompt).toContain("Streaky");
    expect(prompt).toContain("landing_copy");
    expect(prompt).toContain("habit streaks");
  });

  it("passes through a redo verdict", async () => {
    const llm = fakeLlm({ action: "redo", reason: "off-tone" });
    const verdict = await reviewDeliverable(llm, brief, "research", { type: "schema", schema: { weak: true }, contentHash: "0x" });
    expect(verdict.action).toBe("redo");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run src/engine/qa.test.ts`
Expected: FAIL — cannot find module `./qa.js`.

- [ ] **Step 3: Write `src/engine/qa.ts`**

```typescript
/**
 * GLM-5.2 art-director / critic pass. Judges one specialist deliverable against
 * the brief and returns accept / redo / swap. This is the curate+QA loop the
 * agent drives (novelty #3) — the agent calls it as a tool and acts on the
 * verdict (submit, re-hire same provider, or hire a different one).
 */
import { z } from "zod";
import type { Llm } from "../llm/llm.js";
import type { LaunchBrief, LegKind, Deliverable, QaVerdict } from "../types.js";
import { deliverableToText } from "./provenance.js";

export const qaVerdictSchema = z.object({
  action: z.enum(["accept", "redo", "swap"]),
  reason: z.string(),
  score: z.number().min(0).max(100).optional(),
});

export async function reviewDeliverable(
  llm: Llm,
  brief: LaunchBrief,
  leg: LegKind,
  deliverable: Deliverable,
): Promise<QaVerdict> {
  const content = deliverableToText(deliverable).slice(0, 6000);
  const prompt =
    `You are Praeco's art director doing QA on one specialist deliverable for a product launch.\n\n` +
    `PRODUCT BRIEF:\n` +
    `- product: ${brief.product}\n- audience: ${brief.audience}\n- tone: ${brief.tone}\n` +
    `- features: ${brief.features.join(", ")}\n- pitch: ${brief.oneLiner}\n\n` +
    `LEG BEING REVIEWED: ${leg}\n\n` +
    `DELIVERABLE CONTENT:\n${content || "(empty)"}\n\n` +
    `Judge whether this deliverable is on-brief, high quality, and usable as-is.\n` +
    `Respond with JSON: {"action":"accept"|"redo"|"swap","reason":string,"score":0-100}.\n` +
    `Use "accept" if usable, "redo" if the same provider should retry, "swap" if a different provider is needed.`;
  return llm.completeJson(prompt, qaVerdictSchema);
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run src/engine/qa.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/qa.ts src/engine/qa.test.ts
git commit -S -m "feat(engine): GLM-5.2 QA critic (accept/redo/swap)"
```

### Task 10: Intake (text + repo-native)

**Files:**
- Create: `src/engine/intake.ts`
- Create: `src/engine/intake.test.ts`

**Interfaces:**
- Consumes: `Llm` (Task 3); `LaunchBrief` (Task 1); `FetchFn` (Task 4).
- Produces:
  - `interface IntakeInput { text?: string; repoUrl?: string }`
  - `buildBrief(llm: Llm, input: IntakeInput, fetchImpl?: FetchFn): Promise<LaunchBrief>` — repo-native intake (novelty #4) fetches README + package.json; otherwise uses the text.
  - `parseGithubRepo(url: string): { owner: string; repo: string } | null` (exported for testing)

- [ ] **Step 1: Write the failing test `src/engine/intake.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { buildBrief, parseGithubRepo } from "./intake.js";
import type { Llm } from "../llm/llm.js";

const brief = { product: "Streaky", audience: "indie devs", features: ["streaks", "reminders"], tone: "playful", oneLiner: "Track habits without the guilt." };

function fakeLlm(): Llm {
  return {
    completeText: vi.fn(async () => ""),
    completeJson: vi.fn(async () => brief) as Llm["completeJson"],
  };
}

const readmeFetch = (body: string): typeof fetch =>
  (async (url: string) =>
    String(url).includes("README")
      ? new Response(body, { status: 200 })
      : new Response("not found", { status: 404 })) as unknown as typeof fetch;

describe("parseGithubRepo", () => {
  it("extracts owner/repo and strips .git", () => {
    expect(parseGithubRepo("https://github.com/RECTOR-LABS/praeco.git")).toEqual({ owner: "RECTOR-LABS", repo: "praeco" });
    expect(parseGithubRepo("not a url")).toBeNull();
  });
});

describe("buildBrief", () => {
  it("builds a brief from free text", async () => {
    const llm = fakeLlm();
    const out = await buildBrief(llm, { text: "A habit tracker named Streaky" });
    expect(out.product).toBe("Streaky");
    expect(out.sourceUrl).toBeUndefined();
  });

  it("reads the repo README into the prompt and tags sourceUrl", async () => {
    const llm = fakeLlm();
    const out = await buildBrief(llm, { repoUrl: "https://github.com/RECTOR-LABS/praeco" }, readmeFetch("# Streaky\nHabit tracking for builders."));
    const prompt = (llm.completeJson as any).mock.calls[0][0] as string;
    expect(prompt).toContain("Habit tracking for builders");
    expect(out.sourceUrl).toBe("https://github.com/RECTOR-LABS/praeco");
  });

  it("throws when neither text nor repoUrl is provided", async () => {
    await expect(buildBrief(fakeLlm(), {})).rejects.toThrow(/text or repoUrl/i);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run src/engine/intake.test.ts`
Expected: FAIL — cannot find module `./intake.js`.

- [ ] **Step 3: Write `src/engine/intake.ts`**

```typescript
/**
 * Intake: turn a one-liner or a GitHub repo into a structured LaunchBrief
 * (novelty #4, repo-native). For a repo we pull README + package.json from the
 * raw CDN (public, no auth) and let GLM-5.2's large context infer the product.
 */
import { z } from "zod";
import type { Llm } from "../llm/llm.js";
import type { LaunchBrief } from "../types.js";
import type { FetchFn } from "../cap/wallet.js";

export interface IntakeInput {
  text?: string;
  repoUrl?: string;
}

const briefSchema = z.object({
  product: z.string(),
  audience: z.string(),
  features: z.array(z.string()),
  tone: z.string(),
  oneLiner: z.string(),
});

export function parseGithubRepo(url: string): { owner: string; repo: string } | null {
  const m = url.match(/github\.com\/([^/\s]+)\/([^/\s]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

async function fetchRaw(owner: string, repo: string, file: string, fetchImpl: FetchFn): Promise<string> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${file}`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return "";
    return (await res.text()).slice(0, 12000);
  } catch {
    return "";
  }
}

export async function buildBrief(llm: Llm, input: IntakeInput, fetchImpl: FetchFn = fetch): Promise<LaunchBrief> {
  let context = "";
  let sourceUrl: string | undefined;

  if (input.repoUrl) {
    const parsed = parseGithubRepo(input.repoUrl);
    if (!parsed) throw new Error(`not a recognizable GitHub repo URL: ${input.repoUrl}`);
    sourceUrl = input.repoUrl;
    const [readme, pkg] = await Promise.all([
      fetchRaw(parsed.owner, parsed.repo, "README.md", fetchImpl),
      fetchRaw(parsed.owner, parsed.repo, "package.json", fetchImpl),
    ]);
    context = `REPO: ${input.repoUrl}\n\nREADME.md:\n${readme || "(none)"}\n\npackage.json:\n${pkg || "(none)"}`;
    if (!readme && !pkg && !input.text) {
      throw new Error(`could not read README.md or package.json from ${input.repoUrl}`);
    }
  } else if (input.text) {
    context = `PRODUCT DESCRIPTION:\n${input.text}`;
  } else {
    throw new Error("intake requires either text or repoUrl");
  }

  if (input.text && input.repoUrl) context += `\n\nEXTRA NOTES:\n${input.text}`;

  const prompt =
    `You are Praeco's intake analyst. From the material below, infer a concise launch brief.\n\n` +
    `${context}\n\n` +
    `Respond with JSON: {"product":string,"audience":string,"features":string[],"tone":string,"oneLiner":string}.\n` +
    `product = what it is in a few words; audience = who it's for; features = 3-6 key selling points; ` +
    `tone = the voice for marketing copy; oneLiner = a punchy one-sentence pitch.`;

  const brief = await llm.completeJson(prompt, briefSchema);
  return sourceUrl ? { ...brief, sourceUrl } : brief;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run src/engine/intake.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/intake.ts src/engine/intake.test.ts
git commit -S -m "feat(engine): intake — text + repo-native brief builder"
```

### Task 11: Composer

**Files:**
- Create: `src/engine/compose.ts`
- Create: `src/engine/compose.test.ts`

**Interfaces:**
- Consumes: `Llm` (Task 3); `LaunchBrief`, `LaunchAsset`, `LaunchKit` (Task 1); `deliverableToText`, `extractImageRef` (Task 8).
- Produces: `composeKit(llm: Llm, brief: LaunchBrief, assets: LaunchAsset[]): Promise<LaunchKit>` — assembles verified deliverables into the kit and generates tweet thread, short pitch, PH/HN blurb, README polish. Handles missing legs (partial runs) gracefully.

- [ ] **Step 1: Write the failing test `src/engine/compose.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { composeKit } from "./compose.js";
import type { Llm } from "../llm/llm.js";
import type { LaunchAsset, LaunchBrief } from "../types.js";

const brief: LaunchBrief = { product: "Streaky", audience: "builders", features: ["streaks"], tone: "playful", oneLiner: "Track habits." };

const composed = {
  tweetThread: ["1/ Meet Streaky", "2/ It tracks habits"],
  shortPitch: "Streaky — habits, done.",
  phHnBlurb: "Show HN: Streaky",
  readmePolish: "# Streaky\nPolished.",
};

function fakeLlm(): Llm {
  return { completeText: vi.fn(async () => ""), completeJson: vi.fn(async () => composed) as Llm["completeJson"] };
}

function asset(leg: LaunchAsset["leg"], over: Partial<LaunchAsset> = {}): LaunchAsset {
  return {
    leg,
    hire: { leg, serviceId: "s", agentId: "a", agentName: "N", orderId: "o", chainOrderId: "c", priceBaseUnits: "100000", payTxHash: "0xp", deliverTxHash: "0xd", deliverable: { type: "text", text: `copy for ${leg}`, contentHash: "0xh" }, basescanPayUrl: "u", basescanDeliverUrl: "u" },
    verdict: { action: "accept", reason: "ok" },
    provenance: { leg, agentId: "a", agentName: "N", amountUsd: "0.10", contentHash: "0xh", payTxHash: "0xp", basescanUrl: "u" },
    ...over,
  };
}

describe("composeKit", () => {
  it("uses provider copy + image ref and the generated derived assets", async () => {
    const img = asset("og_image", { hire: { ...asset("og_image").hire, deliverable: { type: "text", text: "https://cdn/og.png", contentHash: "0xh" } } });
    const kit = await composeKit(fakeLlm(), brief, [asset("research"), asset("landing_copy"), img]);
    expect(kit.landingCopy).toBe("copy for landing_copy");
    expect(kit.ogImageRef).toBe("https://cdn/og.png");
    expect(kit.tweetThread).toEqual(composed.tweetThread);
    expect(kit.provenance).toHaveLength(3);
  });

  it("degrades gracefully when a leg is missing", async () => {
    const kit = await composeKit(fakeLlm(), brief, [asset("research")]);
    expect(kit.landingCopy).toBe("");
    expect(kit.ogImageRef).toBe("");
    expect(kit.phHnBlurb).toBe("Show HN: Streaky");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run src/engine/compose.test.ts`
Expected: FAIL — cannot find module `./compose.js`.

- [ ] **Step 3: Write `src/engine/compose.ts`**

```typescript
/**
 * Composer: stitch verified specialist deliverables into the finished launch
 * kit and generate the derived assets (tweet thread, short pitch, PH/HN blurb,
 * README polish) with GLM-5.2. Missing legs degrade gracefully (§10) — the kit
 * is assembled from whatever passed QA.
 */
import { z } from "zod";
import type { Llm } from "../llm/llm.js";
import type { LaunchBrief, LaunchAsset, LaunchKit, LegKind } from "../types.js";
import { deliverableToText, extractImageRef } from "./provenance.js";

const composedSchema = z.object({
  tweetThread: z.array(z.string()),
  shortPitch: z.string(),
  phHnBlurb: z.string(),
  readmePolish: z.string(),
});

const find = (assets: LaunchAsset[], leg: LegKind) => assets.find((a) => a.leg === leg);

export async function composeKit(llm: Llm, brief: LaunchBrief, assets: LaunchAsset[]): Promise<LaunchKit> {
  const research = find(assets, "research");
  const landing = find(assets, "landing_copy");
  const image = find(assets, "og_image");

  const landingCopy = landing ? deliverableToText(landing.hire.deliverable) : "";
  const ogImageRef = image ? extractImageRef(image.hire.deliverable) : "";
  const researchText = research ? deliverableToText(research.hire.deliverable).slice(0, 4000) : "(no research leg)";

  const prompt =
    `You are Praeco's composer, assembling a launch kit for "${brief.product}".\n\n` +
    `BRIEF: audience=${brief.audience}; tone=${brief.tone}; features=${brief.features.join(", ")}; pitch=${brief.oneLiner}\n\n` +
    `RESEARCH (from a hired specialist):\n${researchText}\n\n` +
    `LANDING COPY (from a hired specialist):\n${landingCopy || "(none)"}\n\n` +
    `Generate launch assets as JSON: {"tweetThread":string[] (4-6 tweets, the first is the hook),` +
    `"shortPitch":string (<=140 chars),"phHnBlurb":string (a Product Hunt / Hacker News intro),` +
    `"readmePolish":string (a polished README intro section in markdown)}. Match the brief's tone.`;

  const composed = await llm.completeJson(prompt, composedSchema);

  return {
    landingCopy,
    ogImageRef,
    tweetThread: composed.tweetThread,
    shortPitch: composed.shortPitch,
    phHnBlurb: composed.phHnBlurb,
    readmePolish: composed.readmePolish,
    provenance: assets.map((a) => a.provenance),
  };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run src/engine/compose.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full suite + typecheck, then commit**

```bash
pnpm test:run && pnpm typecheck
git add src/engine/compose.ts src/engine/compose.test.ts
git commit -S -m "feat(engine): composer — assemble kit + generate derived assets"
```

---

## Stage D — Agent assembly (worklog, run-context, tools, guards, agent, run)

### Task 12: Worklog + run context (adds pi-agent-core)

**Files:**
- Modify: `package.json` (add `@earendil-works/pi-agent-core@0.80.2`)
- Create: `src/engine/worklog.ts`
- Create: `src/engine/worklog.test.ts`
- Create: `src/engine/context.ts`

**Interfaces:**
- Produces:
  - `class Worklog` — `readonly events: WorklogEvent[]`; `emit(e): void`; `emitKind(kind, message, extra?): void`; `subscribe(fn): () => void`.
  - `mapAgentEvent(ev: AgentEvent): WorklogEvent | null` (agent-level narration → `agent_step`).
  - `attachAgentWorklog(agent: Agent, worklog: Worklog): () => void`.
  - `interface RunConfig`, `interface RunContext` (the shared run state all tools/guards read).

- [ ] **Step 1: Add the dependency**

Run: `pnpm add @earendil-works/pi-agent-core@0.80.2`
Expected: resolves alongside the already-installed `@earendil-works/pi-ai@0.80.2` (it peer-depends on `^0.80.2`).

- [ ] **Step 2: Write the failing test `src/engine/worklog.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { Worklog, mapAgentEvent } from "./worklog.js";

describe("Worklog", () => {
  it("collects emitted events and notifies subscribers", () => {
    const wl = new Worklog();
    const seen: string[] = [];
    const unsub = wl.subscribe((e) => seen.push(e.kind));
    wl.emitKind("run_started", "go");
    wl.emit({ kind: "hire_paid", at: 1, message: "paid" });
    unsub();
    wl.emitKind("run_completed", "done");
    expect(wl.events.map((e) => e.kind)).toEqual(["run_started", "hire_paid", "run_completed"]);
    expect(seen).toEqual(["run_started", "hire_paid"]); // unsubscribed before the last
  });
});

describe("mapAgentEvent", () => {
  it("maps a tool call start to an agent_step", () => {
    const w = mapAgentEvent({ type: "tool_execution_start", toolCallId: "t", toolName: "hire_specialist", args: { leg: "research" } } as any);
    expect(w?.kind).toBe("agent_step");
    expect(w?.message).toContain("hire_specialist");
  });
  it("maps assistant turn text to an agent_step", () => {
    const w = mapAgentEvent({ type: "turn_end", message: { role: "assistant", content: [{ type: "text", text: "Hiring research first." }] }, toolResults: [] } as any);
    expect(w?.message).toBe("Hiring research first.");
  });
  it("ignores events with no narration value", () => {
    expect(mapAgentEvent({ type: "turn_start" } as any)).toBeNull();
    expect(mapAgentEvent({ type: "turn_end", message: { role: "assistant", content: [] }, toolResults: [] } as any)).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `pnpm exec vitest run src/engine/worklog.test.ts`
Expected: FAIL — cannot find module `./worklog.js`.

- [ ] **Step 4: Write `src/engine/worklog.ts`**

```typescript
/**
 * Worklog: the in-memory event stream that becomes the RunRecord and (Phase 2)
 * feeds the Agent-Economy Theater over SSE. Tools and run.ts emit rich domain
 * events; attachAgentWorklog adds the agent's own narration (tool-call intents
 * + assistant text) so the Theater can show Praeco "thinking".
 */
import type { Agent, AgentEvent } from "@earendil-works/pi-agent-core";
import type { WorklogEvent, WorklogEventKind, LegKind } from "../types.js";

export class Worklog {
  readonly events: WorklogEvent[] = [];
  private listeners = new Set<(e: WorklogEvent) => void>();

  emit(e: WorklogEvent): void {
    this.events.push(e);
    for (const l of this.listeners) l(e);
  }

  emitKind(kind: WorklogEventKind, message: string, extra?: { leg?: LegKind; data?: Record<string, unknown> }): void {
    this.emit({ kind, at: Date.now(), message, leg: extra?.leg, data: extra?.data });
  }

  subscribe(fn: (e: WorklogEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

function assistantText(message: unknown): string {
  const m = message as { role?: string; content?: Array<{ type: string; text?: string }> };
  if (m?.role !== "assistant" || !Array.isArray(m.content)) return "";
  return m.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
}

export function mapAgentEvent(ev: AgentEvent): WorklogEvent | null {
  if (ev.type === "tool_execution_start") {
    return { kind: "agent_step", at: Date.now(), message: `calling ${ev.toolName}`, data: { tool: ev.toolName, args: ev.args } };
  }
  if (ev.type === "turn_end") {
    const text = assistantText(ev.message);
    if (text) return { kind: "agent_step", at: Date.now(), message: text };
  }
  return null;
}

export function attachAgentWorklog(agent: Agent, worklog: Worklog): () => void {
  return agent.subscribe((ev) => {
    const w = mapAgentEvent(ev);
    if (w) worklog.emit(w);
  });
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `pnpm exec vitest run src/engine/worklog.test.ts`
Expected: PASS.

- [ ] **Step 6: Write `src/engine/context.ts` (type-only — no test)**

```typescript
/**
 * Shared state for one run. The agent's tools and the money guard all read and
 * mutate this. Maps are the per-run ledgers (candidates discovered, hires paid,
 * QA verdicts, submitted assets) that make the guard's decisions and the final
 * RunRecord assembly possible.
 */
import type { Llm } from "../llm/llm.js";
import type { CapBuyer, HirePollOpts } from "../cap/hire.js";
import type { FetchFn } from "../cap/wallet.js";
import type { BudgetGuard } from "./budget.js";
import type { Worklog } from "./worklog.js";
import type { LaunchBrief, LegKind, LaunchAsset, ServiceCandidate, HireResult, QaVerdict } from "../types.js";

export interface RunConfig {
  apiUrl: string;
  rpcUrl: string;
  agentWallet: string;
  usdcTokenAddress: string;
  preferredServiceIds: Partial<Record<LegKind, string>>;
}

export interface RunContext {
  brief: LaunchBrief;
  llm: Llm;
  client: CapBuyer;
  budget: BudgetGuard;
  worklog: Worklog;
  config: RunConfig;
  fetchImpl: FetchFn;
  requiredLegs: LegKind[];
  hirePollOpts?: HirePollOpts;
  // per-run ledgers
  candidates: Map<string, ServiceCandidate>; // serviceId -> resolved candidate
  pendingHires: Map<string, HireResult>;      // orderId -> hire result awaiting QA/submit
  verdicts: Map<string, QaVerdict>;           // orderId -> QA verdict
  paidOrderIds: Set<string>;                  // idempotency ledger
  assets: Map<LegKind, LaunchAsset>;          // submitted, QA-accepted, one per leg
}
```

- [ ] **Step 7: Typecheck + commit**

```bash
pnpm typecheck && pnpm test:run
git add package.json pnpm-lock.yaml src/engine/worklog.ts src/engine/worklog.test.ts src/engine/context.ts
git commit -S -m "feat(engine): Worklog event stream + shared RunContext; add pi-agent-core"
```

### Task 13: The agent toolbelt

**Files:**
- Create: `src/engine/tools.ts`
- Create: `src/engine/tools.test.ts`

**Interfaces:**
- Consumes: `RunContext` (Task 12); `searchServices`/`resolveCandidate`/`rankCandidates` (Task 5); `hireSpecialist` (Task 6); `assertFunded` (Task 4); `reviewDeliverable` (Task 9); `toProvenanceCard`/`deliverableToText` (Task 8); `baseUnitsToUsd` (Task 1); `AgentTool` + `Type` (pi packages).
- Produces: `buildTools(ctx: RunContext): AgentTool<any>[]` — `[search_marketplace, get_service_schema, hire_specialist, qa_review, submit_asset]`.

- [ ] **Step 1: Write the failing test `src/engine/tools.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { buildTools } from "./tools.js";
import { Worklog } from "./worklog.js";
import { BudgetGuard } from "./budget.js";
import type { RunContext } from "./context.js";
import type { CapBuyer } from "../cap/hire.js";
import type { Llm } from "../llm/llm.js";
import type { ServiceCandidate } from "../types.js";

const fundedFetch = (async () =>
  new Response(JSON.stringify({ result: "0x00000000000000000000000000000000000000000000000000000000001e8480" }), { status: 200 })) as unknown as typeof fetch;

function happyClient(): CapBuyer {
  return {
    negotiateOrder: vi.fn(async () => ({ negotiationId: "n1" })),
    getNegotiation: vi.fn(async () => ({ status: "pending" })),
    listOrders: vi.fn(async () => [{ orderId: "o1", negotiationId: "n1", price: "100000", status: "created" }]),
    getOrder: vi.fn(async () => ({ status: "completed", deliverTxHash: "0xd" })),
    payOrder: vi.fn(async () => ({ txHash: "0xpay" })),
    getDelivery: vi.fn(async () => ({ deliverableType: "text", deliverableText: "research findings", contentHash: "0xh" })),
  };
}

const candidate: ServiceCandidate = {
  serviceId: "s1", agentId: "a1", agentName: "ProofResearch", title: "Verifiable Research",
  priceBaseUnits: "100000", requirementType: "schema",
  requirementSchema: [{ name: "topic", type: "string", required: true }],
  completedOrders: 100, completionRate: 0.99,
};

function ctxFor(client: CapBuyer, llm: Llm): RunContext {
  return {
    brief: { product: "Streaky", audience: "builders", features: ["x"], tone: "playful", oneLiner: "Track habits." },
    llm, client, budget: new BudgetGuard(2_000_000n, 600_000n), worklog: new Worklog(),
    config: { apiUrl: "https://api", rpcUrl: "https://rpc", agentWallet: "0xee47", usdcTokenAddress: "0x8335", preferredServiceIds: {} },
    fetchImpl: fundedFetch, requiredLegs: ["research"], hirePollOpts: { negotiationPolls: 2, deliveryPolls: 2, sleep: async () => {} },
    candidates: new Map([["s1", candidate]]), pendingHires: new Map(), verdicts: new Map(), paidOrderIds: new Set(), assets: new Map(),
  };
}

const fakeLlm = (verdict: unknown): Llm => ({ completeText: vi.fn(async () => ""), completeJson: vi.fn(async () => verdict) as Llm["completeJson"] });
const toolMap = (ctx: RunContext) => Object.fromEntries(buildTools(ctx).map((t) => [t.name, t]));

describe("buildTools", () => {
  it("exposes the five engine tools", () => {
    const names = buildTools(ctxFor(happyClient(), fakeLlm({}))).map((t) => t.name).sort();
    expect(names).toEqual(["get_service_schema", "hire_specialist", "qa_review", "search_marketplace", "submit_asset"].sort());
  });
});

describe("hire_specialist tool", () => {
  it("hires, commits budget, records the order, and checks the wallet", async () => {
    const client = happyClient();
    const ctx = ctxFor(client, fakeLlm({}));
    const res = await toolMap(ctx).hire_specialist.execute("id", { leg: "research", serviceId: "s1", requirements: { topic: "habits" } });
    expect(client.payOrder).toHaveBeenCalledOnce();
    expect(ctx.budget.spent).toBe(100_000n);
    expect(ctx.paidOrderIds.has("o1")).toBe(true);
    expect(ctx.pendingHires.get("o1")?.leg).toBe("research");
    expect((res.details as any).orderId).toBe("o1");
  });

  it("throws (no pay) when the service was never discovered", async () => {
    const ctx = ctxFor(happyClient(), fakeLlm({}));
    ctx.candidates.clear();
    await expect(toolMap(ctx).hire_specialist.execute("id", { leg: "research", serviceId: "s1", requirements: {} })).rejects.toThrow(/search_marketplace first/);
  });
});

describe("qa_review + submit_asset tools", () => {
  it("records a verdict, then submits the asset and signals terminate when all legs done", async () => {
    const client = happyClient();
    const ctx = ctxFor(client, fakeLlm({ action: "accept", reason: "great", score: 90 }));
    await toolMap(ctx).hire_specialist.execute("id", { leg: "research", serviceId: "s1", requirements: { topic: "habits" } });
    const qa = await toolMap(ctx).qa_review.execute("id", { orderId: "o1" });
    expect((qa.details as any).verdict.action).toBe("accept");
    const sub = await toolMap(ctx).submit_asset.execute("id", { orderId: "o1" });
    expect(ctx.assets.get("research")?.provenance.amountUsd).toBe("0.10");
    expect(sub.terminate).toBe(true); // research was the only required leg
  });

  it("refuses to submit an order that did not pass QA", async () => {
    const ctx = ctxFor(happyClient(), fakeLlm({ action: "redo", reason: "weak" }));
    await toolMap(ctx).hire_specialist.execute("id", { leg: "research", serviceId: "s1", requirements: { topic: "habits" } });
    await toolMap(ctx).qa_review.execute("id", { orderId: "o1" });
    await expect(toolMap(ctx).submit_asset.execute("id", { orderId: "o1" })).rejects.toThrow(/has not passed QA/);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run src/engine/tools.test.ts`
Expected: FAIL — cannot find module `./tools.js`.

- [ ] **Step 3: Write `src/engine/tools.ts`**

```typescript
/**
 * The agent's toolbelt. GLM-5.2 drives a launch job by calling these. Each tool
 * is a deterministic, money-aware primitive: discovery and schema reads are
 * free; hire_specialist is the only spending tool and is itself guarded
 * (per-leg price cap + wallet funding via assertPayable) on top of the loop's
 * beforeToolCall budget gate. State flows through the shared RunContext.
 */
import { Type } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { RunContext } from "./context.js";
import type { LegKind, ServiceCandidate } from "../types.js";
import { searchServices, resolveCandidate, rankCandidates } from "../cap/discovery.js";
import { hireSpecialist } from "../cap/hire.js";
import { assertFunded } from "../cap/wallet.js";
import { reviewDeliverable } from "./qa.js";
import { toProvenanceCard, deliverableToText } from "./provenance.js";
import { baseUnitsToUsd } from "../constants.js";

const usd = (b: string) => baseUnitsToUsd(BigInt(b));
const text = (s: string, details: unknown = {}): AgentToolResult<unknown> => ({ content: [{ type: "text", text: s }], details });

export function buildTools(ctx: RunContext): AgentTool<any>[] {
  const search: AgentTool<any> = {
    name: "search_marketplace",
    label: "Search marketplace",
    description: "Find specialist agents for a leg (research | landing_copy | og_image). Returns ranked candidates with price, reputation, and required input fields.",
    parameters: Type.Object({
      leg: Type.String({ description: "research | landing_copy | og_image" }),
      query: Type.String({ description: "search keywords, e.g. 'SEO audit' or 'landing page copy'" }),
    }),
    execute: async (_id, params) => {
      const leg = params.leg as LegKind;
      ctx.worklog.emit({ kind: "leg_search", at: Date.now(), leg, message: `searching: ${params.query}` });
      const hits = await searchServices(ctx.config.apiUrl, params.query, ctx.fetchImpl);
      const resolved: ServiceCandidate[] = [];
      for (const h of hits.slice(0, 5)) {
        try {
          const c = await resolveCandidate(ctx.config.apiUrl, h.serviceId, h.agentId, ctx.fetchImpl);
          ctx.candidates.set(c.serviceId, c);
          resolved.push(c);
        } catch (e) {
          ctx.worklog.emit({ kind: "error", at: Date.now(), leg, message: `could not resolve ${h.serviceId}: ${(e as Error).message}` });
        }
      }
      const ranked = rankCandidates(resolved, { preferredServiceId: ctx.config.preferredServiceIds[leg] });
      for (const c of ranked) {
        ctx.worklog.emit({ kind: "leg_candidate", at: Date.now(), leg, message: `${c.agentName} (${c.serviceId}) $${usd(c.priceBaseUnits)} rate ${(c.completionRate * 100).toFixed(1)}%` });
      }
      if (ranked.length === 0) return text(`No candidates found for "${params.query}". Try different keywords.`, { count: 0 });
      const summary = ranked
        .map((c) => `- serviceId=${c.serviceId} agent="${c.agentName}" price=$${usd(c.priceBaseUnits)} completionRate=${(c.completionRate * 100).toFixed(1)}% orders=${c.completedOrders} requires=[${c.requirementSchema.map((f) => f.name + (f.required ? "*" : "")).join(", ")}]`)
        .join("\n");
      return text(`Candidates for ${leg} (best first):\n${summary}\n\nNext: get_service_schema, then hire_specialist with the best candidate.`, { candidates: ranked.map((c) => c.serviceId) });
    },
  };

  const schema: AgentTool<any> = {
    name: "get_service_schema",
    label: "Get service schema",
    description: "Return the exact required input fields for a discovered service so you can fill them for hire_specialist.",
    parameters: Type.Object({ serviceId: Type.String() }),
    execute: async (_id, params) => {
      const c = ctx.candidates.get(String(params.serviceId));
      if (!c) throw new Error(`unknown serviceId ${params.serviceId} — call search_marketplace first`);
      if (c.requirementType === "text") return text(`Service ${c.serviceId} accepts a free-text brief: ${c.requirementText ?? "(describe the job)"}`, { requirementType: "text" });
      const fields = c.requirementSchema.map((f) => `${f.name}: ${f.type}${f.required ? " (required)" : ""}`).join("\n");
      return text(`Service ${c.serviceId} requires:\n${fields}\n\nPass these as hire_specialist.requirements (a JSON object).`, { schema: c.requirementSchema });
    },
  };

  const hire: AgentTool<any> = {
    name: "hire_specialist",
    label: "Hire specialist",
    description: "Negotiate, pay USDC, and receive a deliverable from a discovered service. Only call after search_marketplace. Returns an orderId to QA next.",
    parameters: Type.Object({
      leg: Type.String(),
      serviceId: Type.String(),
      requirements: Type.Record(Type.String(), Type.Any(), { description: "input object matching the service's schema" }),
    }),
    execute: async (_id, params) => {
      const leg = params.leg as LegKind;
      const c = ctx.candidates.get(String(params.serviceId));
      if (!c) throw new Error(`unknown serviceId ${params.serviceId} — call search_marketplace first`);
      const assertPayable = async (price: bigint) => {
        await assertFunded(ctx.config.rpcUrl, ctx.config.agentWallet, ctx.config.usdcTokenAddress, price, ctx.fetchImpl);
        if (!ctx.budget.canAfford(price)) throw new Error(`price ${baseUnitsToUsd(price)} exceeds remaining run budget ${baseUnitsToUsd(ctx.budget.remaining())}`);
      };
      const result = await hireSpecialist(
        ctx.client,
        { leg, serviceId: c.serviceId, agentId: c.agentId, agentName: c.agentName, requirements: params.requirements as Record<string, unknown>, priceCapBaseUnits: ctx.budget.legCap(), assertPayable },
        (e) => ctx.worklog.emit(e),
        ctx.hirePollOpts,
      );
      ctx.budget.commit(BigInt(result.priceBaseUnits));
      ctx.paidOrderIds.add(result.orderId);
      ctx.pendingHires.set(result.orderId, result);
      const preview = deliverableToText(result.deliverable).slice(0, 500);
      return text(`Hired ${c.agentName} for ${leg}. orderId=${result.orderId}. Deliverable preview:\n${preview}\n\nNext: qa_review this orderId.`, { orderId: result.orderId });
    },
  };

  const qa: AgentTool<any> = {
    name: "qa_review",
    label: "QA review",
    description: "Critique a delivered asset against the brief. Returns accept | redo | swap.",
    parameters: Type.Object({ orderId: Type.String() }),
    execute: async (_id, params) => {
      const h = ctx.pendingHires.get(String(params.orderId));
      if (!h) throw new Error(`unknown orderId ${params.orderId}`);
      const verdict = await reviewDeliverable(ctx.llm, ctx.brief, h.leg, h.deliverable);
      ctx.verdicts.set(h.orderId, verdict);
      ctx.worklog.emit({ kind: "qa_verdict", at: Date.now(), leg: h.leg, message: `QA ${verdict.action}: ${verdict.reason}`, data: { score: verdict.score } });
      const guidance =
        verdict.action === "accept" ? "Call submit_asset with this orderId." :
        verdict.action === "redo" ? "Re-hire the same provider with improved requirements." :
        "Hire a different provider for this leg.";
      return text(`QA verdict: ${verdict.action} (score ${verdict.score ?? "n/a"}). ${verdict.reason}\n${guidance}`, { verdict });
    },
  };

  const submit: AgentTool<any> = {
    name: "submit_asset",
    label: "Submit asset",
    description: "Finalize a QA-accepted deliverable as the asset for its leg. Only call after qa_review returns accept.",
    parameters: Type.Object({ orderId: Type.String() }),
    execute: async (_id, params) => {
      const h = ctx.pendingHires.get(String(params.orderId));
      if (!h) throw new Error(`unknown orderId ${params.orderId}`);
      const verdict = ctx.verdicts.get(h.orderId);
      if (!verdict || verdict.action !== "accept") throw new Error(`order ${h.orderId} has not passed QA — run qa_review until it returns accept`);
      ctx.assets.set(h.leg, { leg: h.leg, hire: h, verdict, provenance: toProvenanceCard(h) });
      ctx.worklog.emit({ kind: "asset_submitted", at: Date.now(), leg: h.leg, message: `asset submitted for ${h.leg}` });
      const done = ctx.requiredLegs.every((l) => ctx.assets.has(l));
      const msg = done
        ? `All ${ctx.requiredLegs.length} legs complete. Stop now.`
        : `${ctx.assets.size}/${ctx.requiredLegs.length} legs done. Move on to the next leg.`;
      return { content: [{ type: "text", text: msg }], details: { leg: h.leg, done }, terminate: done };
    },
  };

  return [search, schema, hire, qa, submit];
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run src/engine/tools.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run full suite + typecheck, then commit**

```bash
pnpm test:run && pnpm typecheck
git add src/engine/tools.ts src/engine/tools.test.ts
git commit -S -m "feat(engine): agent toolbelt (search/schema/hire/qa/submit)"
```

### Task 14: Money guard + runaway backstop

**Files:**
- Create: `src/engine/guard.ts`
- Create: `src/engine/guard.test.ts`

**Interfaces:**
- Consumes: `RunContext` (Task 12); `baseUnitsToUsd` (Task 1); `BeforeToolCallContext`/`BeforeToolCallResult`/`Agent` (pi-agent-core).
- Produces:
  - `makeBeforeToolCall(ctx: RunContext): (c: BeforeToolCallContext) => Promise<BeforeToolCallResult | undefined>` — blocks any `hire_specialist` that targets an already-done leg, an undiscovered service, or a price over the per-leg cap / remaining budget.
  - `attachTurnGuard(agent: Agent, maxTurns: number): () => void` — aborts the run after `maxTurns` turns.

- [ ] **Step 1: Write the failing test `src/engine/guard.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { makeBeforeToolCall, attachTurnGuard } from "./guard.js";
import { Worklog } from "./worklog.js";
import { BudgetGuard } from "./budget.js";
import type { RunContext } from "./context.js";
import type { ServiceCandidate, LaunchAsset } from "../types.js";

const cand = (price: string): ServiceCandidate => ({
  serviceId: "s1", agentId: "a1", agentName: "N", title: "t", priceBaseUnits: price,
  requirementType: "schema", requirementSchema: [], completedOrders: 10, completionRate: 0.9,
});

function ctx(over: Partial<RunContext> = {}): RunContext {
  return {
    budget: new BudgetGuard(2_000_000n, 600_000n), worklog: new Worklog(),
    candidates: new Map([["s1", cand("100000")]]), assets: new Map(),
    requiredLegs: ["research"], pendingHires: new Map(), verdicts: new Map(), paidOrderIds: new Set(),
    ...(over as RunContext),
  } as RunContext;
}
const call = (name: string, args: unknown) => ({ toolCall: { name }, args } as any);

describe("makeBeforeToolCall", () => {
  it("ignores non-hire tools", async () => {
    expect(await makeBeforeToolCall(ctx())(call("search_marketplace", {}))).toBeUndefined();
  });
  it("allows an affordable, discovered, not-yet-done hire", async () => {
    expect(await makeBeforeToolCall(ctx())(call("hire_specialist", { leg: "research", serviceId: "s1" }))).toBeUndefined();
  });
  it("blocks a leg that already has an asset", async () => {
    const c = ctx({ assets: new Map([["research", {} as LaunchAsset]]) });
    const r = await makeBeforeToolCall(c)(call("hire_specialist", { leg: "research", serviceId: "s1" }));
    expect(r?.block).toBe(true);
    expect(c.worklog.events.at(-1)?.kind).toBe("hire_blocked");
  });
  it("blocks an undiscovered service", async () => {
    const r = await makeBeforeToolCall(ctx())(call("hire_specialist", { leg: "research", serviceId: "ghost" }));
    expect(r?.block).toBe(true);
    expect(r?.reason).toMatch(/search_marketplace first/);
  });
  it("blocks a hire over the per-leg cap", async () => {
    const c = ctx({ candidates: new Map([["s1", cand("700000")]]) });
    const r = await makeBeforeToolCall(c)(call("hire_specialist", { leg: "research", serviceId: "s1" }));
    expect(r?.reason).toMatch(/per-leg cap/);
  });
  it("blocks a hire over the remaining run budget", async () => {
    const b = new BudgetGuard(500_000n, 600_000n);
    b.commit(450_000n);
    const r = await makeBeforeToolCall(ctx({ budget: b }))(call("hire_specialist", { leg: "research", serviceId: "s1" }));
    expect(r?.reason).toMatch(/run budget/);
  });
});

describe("attachTurnGuard", () => {
  it("aborts the agent after maxTurns turns", () => {
    let listener: (ev: any) => void = () => {};
    const agent = { subscribe: (fn: any) => { listener = fn; return () => {}; }, abort: vi.fn() } as any;
    attachTurnGuard(agent, 2);
    listener({ type: "turn_end" });
    expect(agent.abort).not.toHaveBeenCalled();
    listener({ type: "turn_end" });
    expect(agent.abort).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run src/engine/guard.test.ts`
Expected: FAIL — cannot find module `./guard.js`.

- [ ] **Step 3: Write `src/engine/guard.ts`**

```typescript
/**
 * Loop-level money guard. The agent (GLM-5.2) decides WHAT to hire; this guard
 * decides whether the loop is ALLOWED to run the hire — enforced by
 * pi-agent-core's beforeToolCall hook, which runs after args are validated and
 * before the tool executes. It is the hard ceiling the LLM cannot talk past.
 * attachTurnGuard is the runaway backstop.
 */
import type { Agent, BeforeToolCallContext, BeforeToolCallResult } from "@earendil-works/pi-agent-core";
import type { RunContext } from "./context.js";
import type { LegKind } from "../types.js";
import { baseUnitsToUsd } from "../constants.js";

export function makeBeforeToolCall(
  ctx: RunContext,
): (c: BeforeToolCallContext) => Promise<BeforeToolCallResult | undefined> {
  return async ({ toolCall, args }) => {
    if (toolCall.name !== "hire_specialist") return undefined;
    const a = args as { leg?: LegKind; serviceId?: string };
    const block = (reason: string): BeforeToolCallResult => {
      ctx.worklog.emit({ kind: "hire_blocked", at: Date.now(), leg: a.leg, message: reason });
      return { block: true, reason };
    };
    if (a.leg && ctx.assets.has(a.leg)) return block(`leg ${a.leg} already has a submitted asset — do not hire it again`);
    const c = a.serviceId ? ctx.candidates.get(a.serviceId) : undefined;
    if (!c) return block(`serviceId ${a.serviceId ?? "(none)"} was not discovered — call search_marketplace first`);
    const price = BigInt(c.priceBaseUnits);
    if (ctx.budget.exceedsLegCap(price)) return block(`price $${baseUnitsToUsd(price)} exceeds the per-leg cap $${baseUnitsToUsd(ctx.budget.legCap())}`);
    if (!ctx.budget.canAfford(price)) return block(`price $${baseUnitsToUsd(price)} exceeds the remaining run budget $${baseUnitsToUsd(ctx.budget.remaining())}`);
    return undefined;
  };
}

export function attachTurnGuard(agent: Agent, maxTurns: number): () => void {
  let turns = 0;
  return agent.subscribe((ev) => {
    if (ev.type === "turn_end") {
      turns++;
      if (turns >= maxTurns) agent.abort();
    }
  });
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run src/engine/guard.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/guard.ts src/engine/guard.test.ts
git commit -S -m "feat(engine): loop-level money guard + runaway turn backstop"
```

### Task 15: Assemble the Praeco agent

**Files:**
- Create: `src/engine/agent.ts`
- Create: `src/engine/agent.test.ts`

**Interfaces:**
- Consumes: `RunContext` (Task 12); `buildTools` (Task 13); `makeBeforeToolCall`/`attachTurnGuard` (Task 14); `StreamFn` (Task 2); `MAX_TURNS`/`baseUnitsToUsd` (Task 1); `Agent` (pi-agent-core); `Model` (pi-ai).
- Produces: `systemPrompt(ctx: RunContext): string`; `createPraecoAgent(ctx: RunContext, deps: { model: Model<any>; streamFn: StreamFn }): Agent`.

> Wiring-only test (per Design Decision #6): the live loop is proven by the smoke (Task 17), not a unit test — fabricating an `AssistantMessageEventStream` would test the mock, not the system.

- [ ] **Step 1: Write the failing test `src/engine/agent.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { createPraecoAgent, systemPrompt } from "./agent.js";
import { Worklog } from "./worklog.js";
import { BudgetGuard } from "./budget.js";
import type { RunContext } from "./context.js";

function ctx(): RunContext {
  return {
    brief: { product: "Streaky", audience: "builders", features: ["streaks"], tone: "playful", oneLiner: "Track habits." },
    budget: new BudgetGuard(2_000_000n, 600_000n), worklog: new Worklog(),
    requiredLegs: ["research", "landing_copy", "og_image"],
    candidates: new Map(), pendingHires: new Map(), verdicts: new Map(), paidOrderIds: new Set(), assets: new Map(),
  } as RunContext;
}

const deps = {
  model: { id: "glm-5.2:cloud" } as any,
  streamFn: (() => { throw new Error("streamFn must not run during a wiring test"); }) as any,
};

describe("systemPrompt", () => {
  it("states the required legs and the budget caps", () => {
    const p = systemPrompt(ctx());
    expect(p).toContain("research, landing_copy, og_image");
    expect(p).toContain("per-leg cap $0.60");
    expect(p).toMatch(/STOP/i);
  });
});

describe("createPraecoAgent", () => {
  it("wires the five tools, the system prompt, and sequential tool execution", () => {
    const agent = createPraecoAgent(ctx(), deps);
    expect(agent.state.tools.map((t) => t.name).sort()).toEqual(
      ["get_service_schema", "hire_specialist", "qa_review", "search_marketplace", "submit_asset"].sort(),
    );
    expect(agent.state.systemPrompt).toContain("Praeco");
    expect(agent.toolExecution).toBe("sequential");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run src/engine/agent.test.ts`
Expected: FAIL — cannot find module `./agent.js`.

- [ ] **Step 3: Write `src/engine/agent.ts`**

```typescript
/**
 * Assembles the Praeco agent: GLM-5.2 + the toolbelt + the money guard + the
 * runaway backstop. toolExecution is "sequential" so money operations never
 * race. The system prompt gives the LLM agency over decisions while the guard
 * holds the money invariants.
 */
import { Agent } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import type { StreamFn } from "../llm/model.js";
import type { RunContext } from "./context.js";
import { buildTools } from "./tools.js";
import { makeBeforeToolCall, attachTurnGuard } from "./guard.js";
import { MAX_TURNS, baseUnitsToUsd } from "../constants.js";

export function systemPrompt(ctx: RunContext): string {
  return [
    `You are Praeco, an autonomous general contractor for product launches on the CROO agent marketplace.`,
    `Your job: assemble a launch kit by hiring REAL specialist agents — one per required leg — and paying each in USDC.`,
    `Required legs: ${ctx.requiredLegs.join(", ")}.`,
    `Product: ${ctx.brief.product} — ${ctx.brief.oneLiner} (audience: ${ctx.brief.audience}; tone: ${ctx.brief.tone}).`,
    ``,
    `Budget: total $${baseUnitsToUsd(ctx.budget.remaining())}, per-leg cap $${baseUnitsToUsd(ctx.budget.legCap())}. ` +
      `You CANNOT exceed these — over-budget hires are blocked automatically.`,
    ``,
    `For EACH required leg, in order:`,
    `1. search_marketplace(leg, query): find candidates. Prefer high completionRate and many completedOrders. ` +
      `Avoid 0-order stubs — they accept but may never deliver.`,
    `2. get_service_schema(serviceId): learn the exact required input fields.`,
    `3. hire_specialist(leg, serviceId, requirements): fill the schema from the brief, then hire. Returns an orderId.`,
    `4. qa_review(orderId): critique it. "accept" -> submit_asset(orderId). "redo" -> hire the SAME provider again ` +
      `with better requirements. "swap" -> hire a DIFFERENT provider for this leg.`,
    ``,
    `Do one leg at a time. When every required leg has a submitted asset, STOP — make no further tool calls and hire nothing extra.`,
    `Be decisive and frugal: one good, QA-passed hire per leg is the goal.`,
  ].join("\n");
}

export function createPraecoAgent(ctx: RunContext, deps: { model: Model<any>; streamFn: StreamFn }): Agent {
  const agent = new Agent({
    initialState: {
      systemPrompt: systemPrompt(ctx),
      model: deps.model,
      tools: buildTools(ctx),
    },
    streamFn: deps.streamFn as Agent["streamFn"],
    convertToLlm: (messages) =>
      messages.filter((m) => m.role === "user" || m.role === "assistant" || m.role === "toolResult"),
    beforeToolCall: makeBeforeToolCall(ctx),
    toolExecution: "sequential",
  });
  attachTurnGuard(agent, MAX_TURNS);
  return agent;
}
```

> If `streamFn: deps.streamFn as Agent["streamFn"]` does not typecheck, the two `StreamFn` definitions are structurally identical — import the `StreamFn` type from `@earendil-works/pi-agent-core` for `deps` instead, or cast through `unknown`. Do not change runtime behavior.

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run src/engine/agent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/agent.ts src/engine/agent.test.ts
git commit -S -m "feat(engine): assemble Praeco agent (model + tools + guards)"
```

### Task 16: Run orchestration

**Files:**
- Create: `src/engine/run.ts`
- Create: `src/engine/run.test.ts`

**Interfaces:**
- Consumes: everything above; `Config` (Task 1); `IntakeInput`/`buildBrief` (Task 10); `composeKit` (Task 11); `createPraecoAgent` (Task 15); `attachAgentWorklog`/`Worklog` (Task 12); `BudgetGuard` (Task 7).
- Produces:
  - `interface DriveResult { errorMessage?: string }`
  - `type EngineDriver = (ctx: RunContext, deps: { model; streamFn }) => Promise<DriveResult>`
  - `interface RunDeps { config; llm; client; model; streamFn; fetchImpl?; hirePollOpts?; now?; runId?; drive? }`
  - `runLaunchJob(input: IntakeInput, deps: RunDeps): Promise<RunRecord>`

- [ ] **Step 1: Write the failing test `src/engine/run.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { runLaunchJob, type EngineDriver } from "./run.js";
import { buildTools } from "./tools.js";
import type { RunContext } from "./context.js";
import type { Config } from "../config.js";
import type { Llm } from "../llm/llm.js";
import type { CapBuyer } from "../cap/hire.js";

const config: Config = {
  crooApiUrl: "https://api", crooWsUrl: "wss://api", crooSdkKey: "k", baseRpcUrl: "https://rpc",
  ollamaApiKey: "o", ollamaBaseUrl: "https://ollama", praecoAgentId: "p", praecoAgentWallet: "0xee47",
  usdcTokenAddress: "0x8335", runBudgetUsdc: "2.00", legCapUsdc: "0.60", preferredServiceIds: {},
};

// One fetch impl serving discovery (GET) + the funded balance (POST eth_call).
const fetchImpl = (async (url: string, init?: RequestInit) => {
  if (init?.method === "POST") return new Response(JSON.stringify({ result: "0x00000000000000000000000000000000000000000000000000000000001e8480" }), { status: 200 });
  if (String(url).includes("/public/search")) return new Response(JSON.stringify([{ serviceId: "s1", agentId: "a1", agentName: "ProvenAgent", title: "svc", price: "100000", orders7d: 50 }]), { status: 200 });
  if (String(url).includes("/public/agents/a1")) return new Response(JSON.stringify({ agentId: "a1", name: "ProvenAgent", completedOrders: 500, completionRate: 0.99, services: [{ serviceId: "s1", title: "svc", price: "100000", requirementType: "schema", requirementSchema: [{ name: "topic", type: "string", required: true }] }] }), { status: 200 });
  return new Response("not found", { status: 404 });
}) as unknown as typeof fetch;

function happyClient(): CapBuyer {
  return {
    negotiateOrder: vi.fn(async () => ({ negotiationId: "n1" })),
    getNegotiation: vi.fn(async () => ({ status: "pending" })),
    listOrders: vi.fn(async () => [{ orderId: "o1", negotiationId: "n1", price: "100000", status: "created" }]),
    getOrder: vi.fn(async () => ({ status: "completed", deliverTxHash: "0xd" })),
    payOrder: vi.fn(async () => ({ txHash: "0xpay" })),
    getDelivery: vi.fn(async () => ({ deliverableType: "text", deliverableText: "https://cdn/og.png", contentHash: "0xh" })),
  };
}

const fakeLlm: Llm = {
  completeText: async () => "",
  completeJson: (async (prompt: string) => {
    if (prompt.includes("intake analyst")) return { product: "Streaky", audience: "builders", features: ["streaks"], tone: "playful", oneLiner: "Track habits." };
    if (prompt.includes("art director")) return { action: "accept", reason: "on-brief", score: 88 };
    if (prompt.includes("composer")) return { tweetThread: ["1/ Meet Streaky"], shortPitch: "p", phHnBlurb: "Show HN: Streaky", readmePolish: "# Streaky" };
    throw new Error("unexpected prompt: " + prompt.slice(0, 50));
  }) as Llm["completeJson"],
};

// A scripted driver standing in for the GLM agent loop: run the real tools per leg.
const scriptedDriver: EngineDriver = async (ctx: RunContext) => {
  const tools = Object.fromEntries(buildTools(ctx).map((t) => [t.name, t]));
  for (const leg of ctx.requiredLegs) {
    await tools.search_marketplace.execute("x", { leg, query: leg });
    await tools.get_service_schema.execute("x", { serviceId: "s1" });
    const hire = await tools.hire_specialist.execute("x", { leg, serviceId: "s1", requirements: { topic: "habits" } });
    const orderId = (hire.details as any).orderId;
    await tools.qa_review.execute("x", { orderId });
    await tools.submit_asset.execute("x", { orderId });
  }
  return {};
};

const baseDeps = () => ({
  config, llm: fakeLlm, client: happyClient(), model: {} as any, streamFn: (() => { throw new Error("unused"); }) as any,
  fetchImpl, hirePollOpts: { negotiationPolls: 2, deliveryPolls: 2, sleep: async () => {} }, now: () => 1000, runId: "run-test",
});

describe("runLaunchJob", () => {
  it("runs intake → 3 hires → compose and returns a completed RunRecord", async () => {
    const rec = await runLaunchJob({ text: "Streaky habit tracker" }, { ...baseDeps(), drive: scriptedDriver });
    expect(rec.status).toBe("completed");
    expect(rec.brief.product).toBe("Streaky");
    expect(rec.assets.map((a) => a.leg).sort()).toEqual(["landing_copy", "og_image", "research"].sort());
    expect(rec.spentBaseUnits).toBe("300000"); // 3 × $0.10
    expect(rec.kit?.ogImageRef).toBe("https://cdn/og.png");
    expect(rec.kit?.tweetThread).toEqual(["1/ Meet Streaky"]);
    const kinds = rec.worklog.map((e) => e.kind);
    expect(kinds).toContain("run_started");
    expect(kinds.filter((k) => k === "asset_submitted")).toHaveLength(3);
    expect(kinds).toContain("run_completed");
  });

  it("returns a partial RunRecord (still composes) when only some legs finish", async () => {
    const oneLeg: EngineDriver = async (ctx) => {
      const tools = Object.fromEntries(buildTools(ctx).map((t) => [t.name, t]));
      await tools.search_marketplace.execute("x", { leg: "research", query: "research" });
      const hire = await tools.hire_specialist.execute("x", { leg: "research", serviceId: "s1", requirements: { topic: "x" } });
      await tools.qa_review.execute("x", { orderId: (hire.details as any).orderId });
      await tools.submit_asset.execute("x", { orderId: (hire.details as any).orderId });
      return {};
    };
    const rec = await runLaunchJob({ text: "Streaky" }, { ...baseDeps(), drive: oneLeg });
    expect(rec.status).toBe("partial");
    expect(rec.assets).toHaveLength(1);
    expect(rec.kit).toBeDefined();
  });

  it("returns failed (no kit) when the driver throws before any asset", async () => {
    const boom: EngineDriver = async () => { throw new Error("loop exploded"); };
    const rec = await runLaunchJob({ text: "Streaky" }, { ...baseDeps(), drive: boom });
    expect(rec.status).toBe("failed");
    expect(rec.kit).toBeUndefined();
    expect(rec.worklog.some((e) => e.kind === "error")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run src/engine/run.test.ts`
Expected: FAIL — cannot find module `./run.js`.

- [ ] **Step 3: Write `src/engine/run.ts`**

```typescript
/**
 * Top-level engine entry point: intake -> build RunContext -> drive the agent
 * loop -> compose the kit -> assemble the RunRecord. The driver is injectable
 * so the full pipeline is testable with a scripted stand-in; the default driver
 * runs the real GLM-5.2 agent. Partial runs (some legs failed) still compose
 * whatever passed QA (graceful degradation, SPEC §10).
 */
import type { Model } from "@earendil-works/pi-ai";
import type { StreamFn } from "../llm/model.js";
import type { Config } from "../config.js";
import type { Llm } from "../llm/llm.js";
import type { CapBuyer, HirePollOpts } from "../cap/hire.js";
import type { FetchFn } from "../cap/wallet.js";
import type { RunContext } from "./context.js";
import type { RunRecord, RunStatus, LaunchAsset, LaunchKit } from "../types.js";
import { type IntakeInput, buildBrief } from "./intake.js";
import { BudgetGuard } from "./budget.js";
import { Worklog, attachAgentWorklog } from "./worklog.js";
import { createPraecoAgent } from "./agent.js";
import { composeKit } from "./compose.js";
import { REQUIRED_LEGS, usdToBaseUnits, baseUnitsToUsd } from "../constants.js";

export interface DriveResult {
  errorMessage?: string;
}

export type EngineDriver = (ctx: RunContext, deps: { model: Model<any>; streamFn: StreamFn }) => Promise<DriveResult>;

function kickoff(ctx: RunContext): string {
  return `Assemble the launch kit for "${ctx.brief.product}". Required legs: ${ctx.requiredLegs.join(", ")}. Begin with the first leg now.`;
}

const defaultDriver: EngineDriver = async (ctx, deps) => {
  const agent = createPraecoAgent(ctx, deps);
  attachAgentWorklog(agent, ctx.worklog);
  await agent.prompt(kickoff(ctx));
  return { errorMessage: agent.state.errorMessage };
};

export interface RunDeps {
  config: Config;
  llm: Llm;
  client: CapBuyer;
  model: Model<any>;
  streamFn: StreamFn;
  fetchImpl?: FetchFn;
  hirePollOpts?: HirePollOpts;
  now?: () => number;
  runId?: string;
  drive?: EngineDriver;
}

export async function runLaunchJob(input: IntakeInput, deps: RunDeps): Promise<RunRecord> {
  const now = deps.now ?? (() => Date.now());
  const startedAt = now();
  const runId = deps.runId ?? `run-${startedAt}`;
  const worklog = new Worklog();
  worklog.emitKind("run_started", `run ${runId} started`);

  const brief = await buildBrief(deps.llm, input, deps.fetchImpl);
  worklog.emitKind("intake_done", `brief ready: ${brief.product}`, { data: { oneLiner: brief.oneLiner } });

  const budget = new BudgetGuard(usdToBaseUnits(deps.config.runBudgetUsdc), usdToBaseUnits(deps.config.legCapUsdc));
  const ctx: RunContext = {
    brief,
    llm: deps.llm,
    client: deps.client,
    budget,
    worklog,
    config: {
      apiUrl: deps.config.crooApiUrl,
      rpcUrl: deps.config.baseRpcUrl,
      agentWallet: deps.config.praecoAgentWallet,
      usdcTokenAddress: deps.config.usdcTokenAddress,
      preferredServiceIds: deps.config.preferredServiceIds,
    },
    fetchImpl: deps.fetchImpl ?? fetch,
    requiredLegs: REQUIRED_LEGS,
    hirePollOpts: deps.hirePollOpts,
    candidates: new Map(),
    pendingHires: new Map(),
    verdicts: new Map(),
    paidOrderIds: new Set(),
    assets: new Map(),
  };

  const drive = deps.drive ?? defaultDriver;
  let driveError: string | undefined;
  try {
    const res = await drive(ctx, { model: deps.model, streamFn: deps.streamFn });
    driveError = res.errorMessage;
    if (driveError) worklog.emitKind("error", `agent reported: ${driveError}`);
  } catch (e) {
    driveError = (e as Error).message;
    worklog.emitKind("error", `engine driver error: ${driveError}`);
  }

  const assets: LaunchAsset[] = ctx.requiredLegs
    .map((l) => ctx.assets.get(l))
    .filter((a): a is LaunchAsset => a !== undefined);

  let status: RunStatus;
  if (assets.length === ctx.requiredLegs.length) status = "completed";
  else if (assets.length > 0) status = "partial";
  else status = driveError ? "failed" : "aborted";

  let kit: LaunchKit | undefined;
  if (assets.length > 0) {
    worklog.emitKind("compose_started", "composing the launch kit");
    kit = await composeKit(deps.llm, brief, assets);
  }

  const endedAt = now();
  worklog.emitKind(status === "completed" ? "run_completed" : "run_aborted",
    `run ${runId}: ${status} — ${assets.length}/${ctx.requiredLegs.length} legs, spent $${baseUnitsToUsd(budget.spent)}`);

  return {
    runId,
    status,
    brief,
    assets,
    kit,
    worklog: worklog.events,
    spentBaseUnits: budget.spent.toString(),
    startedAt,
    endedAt,
  };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run src/engine/run.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run full suite + typecheck, then commit**

```bash
pnpm test:run && pnpm typecheck
git add src/engine/run.ts src/engine/run.test.ts
git commit -S -m "feat(engine): runLaunchJob orchestration (intake→drive→compose→record)"
```

---

## Stage E — CLI, loop smoke, and live mainnet proof

### Task 17: Engine CLI + `engine:smoke` (mock CAP) + `engine:run` (LIVE)

**Files:**
- Modify: `src/engine/run.ts` (add `onEvent` to `RunDeps` for live streaming)
- Create: `scripts/run-job.ts`
- Modify: `package.json` (scripts), `.gitignore` (ignore `runs/`)

**Interfaces:**
- Consumes: `loadConfig` (Task 1), `createGlmModels` (Task 2), `createLlm` (Task 3), `runLaunchJob` (Task 16), `AgentClient` (CROO SDK).
- Produces: `pnpm engine:smoke` (real GLM-5.2 + mock CAP, $0) and `pnpm engine:run` (LIVE mainnet, ~$0.30) — both write a `RunRecord` to `runs/<runId>.json`.

> **Design Decision #6 in action:** `engine:smoke` is how the assembled GLM-5.2 agent loop is validated. It is NOT a vitest test — it makes a live (free) LLM call and proves the loop drives the real tools/guards end-to-end against a mock marketplace, with zero money. `engine:run` is the Phase-1 acceptance proof on mainnet, run deliberately with RECTOR's authorization (like Phase-0 `smoke:hire`).

- [ ] **Step 1: Add `onEvent` streaming to `RunDeps`** — two edits in `src/engine/run.ts`

Edit the types import line:
```typescript
import type { RunRecord, RunStatus, LaunchAsset, LaunchKit, WorklogEvent } from "../types.js";
```
Add to the `RunDeps` interface (after `drive?: EngineDriver;`):
```typescript
  onEvent?: (e: WorklogEvent) => void;
```
Wire it right after the worklog is created (so `run_started` is captured):
```typescript
  const worklog = new Worklog();
  if (deps.onEvent) worklog.subscribe(deps.onEvent);
  worklog.emitKind("run_started", `run ${runId} started`);
```

- [ ] **Step 2: Verify the suite still passes after the edit**

Run: `pnpm test:run && pnpm typecheck`
Expected: PASS — `onEvent` is optional, no test regressions.

- [ ] **Step 3: Write `scripts/run-job.ts`**

```typescript
/**
 * Praeco engine CLI.
 *   pnpm engine:smoke  — real GLM-5.2 drives the loop against a MOCK marketplace
 *                        (no money, no chain). Proves the agent loop end-to-end.
 *   pnpm engine:run    — LIVE: real GLM + real CAP. Real USDC on Base. Run
 *                        deliberately, with RECTOR's authorization. ~$0.30/run.
 *
 * Input: JOB_REPO=<github url>  OR  JOB_TEXT="<one-liner>" (defaults provided).
 * Output: runs/<runId>.json (full RunRecord with Basescan receipts).
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { AgentClient } from "@croo-network/sdk";
import { loadConfig } from "../src/config.js";
import { createGlmModels } from "../src/llm/model.js";
import { createLlm } from "../src/llm/llm.js";
import { runLaunchJob } from "../src/engine/run.js";
import type { CapBuyer } from "../src/cap/hire.js";
import type { FetchFn } from "../src/cap/wallet.js";

const LIVE = process.env.ENGINE_LIVE === "1";
const input = process.env.JOB_REPO
  ? { repoUrl: process.env.JOB_REPO }
  : { text: process.env.JOB_TEXT ?? "A privacy-first habit tracker named Streaky for indie developers." };

const cfg = loadConfig();
const { models, model, streamFn } = createGlmModels();
// Thin adapter: keeps llm.ts decoupled from pi-ai's generic Models type.
const llm = createLlm({ complete: (m, c) => models.complete(m, c) }, model);

// --- Mock marketplace for the no-money smoke ---
function mockFetch(): FetchFn {
  const candidates = [
    { serviceId: "mock-research", agentId: "ma1", agentName: "ProofResearch", title: "Verifiable Research", price: "100000", orders7d: 30 },
    { serviceId: "mock-copy", agentId: "ma2", agentName: "Foundr", title: "Landing Page Copy", price: "100000", orders7d: 80 },
    { serviceId: "mock-image", agentId: "ma3", agentName: "Pygm Studio", title: "OG Image", price: "500000", orders7d: 25 },
  ];
  const agents: Record<string, unknown> = {};
  for (const c of candidates) {
    agents[`/public/agents/${c.agentId}`] = {
      agentId: c.agentId, name: c.agentName, completedOrders: 500, completionRate: 0.98,
      services: [{ serviceId: c.serviceId, title: c.title, price: c.price, requirementType: "schema", requirementSchema: [{ name: "brief", type: "string", required: true }] }],
    };
  }
  return (async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return new Response(JSON.stringify({ result: "0x00000000000000000000000000000000000000000000000000000000004c4b40" }), { status: 200 }); // 5 USDC
    const u = String(url);
    if (u.includes("/public/search")) return new Response(JSON.stringify(candidates), { status: 200 });
    const agentKey = Object.keys(agents).find((k) => u.includes(k));
    if (agentKey) return new Response(JSON.stringify(agents[agentKey]), { status: 200 });
    return new Response("not found", { status: 404 });
  }) as unknown as FetchFn;
}

function mockClient(): CapBuyer {
  let n = 0;
  let lastNeg = "";
  const copy =
    "Headline: Build habits that actually stick. Subhead: Streaky is a privacy-first habit tracker for indie devs — " +
    "gentle streaks, zero guilt, your data stays yours. CTA: Start your first streak.";
  return {
    negotiateOrder: async () => { lastNeg = `neg-${++n}`; return { negotiationId: lastNeg }; },
    getNegotiation: async () => ({ status: "pending" }),
    listOrders: async () => [{ orderId: `ord-${n}`, negotiationId: lastNeg, price: "100000", status: "created" }],
    getOrder: async () => ({ status: "completed", deliverTxHash: `0xmockdeliver${n}` }),
    payOrder: async () => ({ txHash: `0xmockpay${n}` }),
    getDelivery: async () => ({ deliverableType: "text", deliverableText: copy, contentHash: `0xmockhash${n}` }),
  };
}

async function main() {
  let client: CapBuyer;
  let fetchImpl: FetchFn;
  let ws: { close?: () => void } | undefined;

  if (LIVE) {
    const live = new AgentClient(
      { baseURL: cfg.crooApiUrl, wsURL: cfg.crooWsUrl, rpcURL: cfg.baseRpcUrl },
      cfg.crooSdkKey,
    );
    await live.connectWebSocket(); // presence: providers won't transact with an offline requester
    console.log("[ws] online — LIVE mainnet run; real USDC will be spent");
    client = live as unknown as CapBuyer;
    fetchImpl = fetch as FetchFn;
    ws = live as unknown as { close?: () => void };
  } else {
    console.log("[smoke] mock marketplace — no money, no chain");
    client = mockClient();
    fetchImpl = mockFetch();
  }

  const rec = await runLaunchJob(input, {
    config: cfg, llm, client, model, streamFn, fetchImpl,
    onEvent: (e) => console.log(`  • [${e.kind}]${e.leg ? " " + e.leg : ""} ${e.message}`),
  });

  mkdirSync("runs", { recursive: true });
  const path = `runs/${rec.runId}.json`;
  writeFileSync(path, JSON.stringify(rec, null, 2));

  console.log(`\n=== ${rec.status.toUpperCase()} — ${rec.assets.length}/${rec.brief ? 3 : 0} legs, spent $${(Number(rec.spentBaseUnits) / 1e6).toFixed(2)} ===`);
  for (const a of rec.assets) {
    console.log(`  ${a.leg}: ${a.provenance.agentName} $${a.provenance.amountUsd} — ${a.provenance.basescanUrl}`);
  }
  if (rec.kit) {
    console.log(`\n  landingCopy: ${rec.kit.landingCopy.slice(0, 120)}…`);
    console.log(`  ogImageRef: ${rec.kit.ogImageRef}`);
    console.log(`  tweet 1/: ${rec.kit.tweetThread[0] ?? "(none)"}`);
  }
  console.log(`\n[saved] ${path}`);
  ws?.close?.();
  process.exit(rec.status === "completed" ? 0 : 1);
}

main().catch((e) => {
  console.error("[fatal]", e);
  process.exit(1);
});
```

- [ ] **Step 4: Add package scripts + gitignore `runs/`**

In `package.json` `scripts`, add:
```json
    "engine:smoke": "tsx scripts/run-job.ts",
    "engine:run": "ENGINE_LIVE=1 tsx scripts/run-job.ts"
```
Append to `.gitignore`:
```
runs/
```

- [ ] **Step 5: Run the no-money loop smoke (real GLM-5.2, mock CAP)**

Run: `pnpm engine:smoke`
Expected: GLM-5.2 drives the loop — you see `[leg_search] → [leg_candidate] → [hire_negotiating] → [hire_paid] (0xmockpay…) → [hire_delivered] → [qa_verdict] → [asset_submitted]` for each of the 3 legs, then `[compose_started]` and `=== COMPLETED — 3/3 legs, spent $0.30 ===`. A `runs/run-*.json` is written.

> If GLM stalls, loops, or fills a schema wrong, this is the tuning point — adjust the `systemPrompt` (Task 15) and tool descriptions (Task 13), re-run. The money guards mean a misbehaving loop cannot overspend even live; here it cannot spend at all. Do not proceed to Step 6 until the smoke reaches `COMPLETED` reliably.

- [ ] **Step 6: LIVE mainnet acceptance run (RECTOR-authorized)**

First confirm Praeco's agent wallet is funded (gate #1) — it needs ≥ ~$0.70 for 3 legs:
```bash
# (RECTOR) top up via agent.croo.network → My Agents → Top Up if low
```
Then, **with explicit per-session authorization** (re-confirm before spending — this is real USDC):
```bash
pnpm engine:run
```
Expected: the same flow against the live network — real `payTx`/`deliverTx` hashes, real Basescan links, `=== COMPLETED — 3/3 legs, spent ~$0.30 ===`, `runs/run-*.json` with on-chain receipts. This is the Phase-1 engine acceptance proof.

- [ ] **Step 7: Commit (code only — never commit `runs/` outputs or `.env`)**

```bash
pnpm test:run && pnpm typecheck
git add src/engine/run.ts scripts/run-job.ts package.json .gitignore
git commit -S -m "feat(engine): engine CLI — no-money loop smoke + live mainnet run"
```

- [ ] **Step 8: Record the live proof** — append the live run's `runId`, `payTx`/`deliverTx` hashes, total spend, and the resulting kit summary to a short `docs/superpowers/specs/2026-06-27-phase1-engine-proof.md` (mirrors the Phase-0 findings doc), then commit it. This is the artifact the Phase-2 handoff references.

```bash
git add docs/superpowers/specs/2026-06-27-phase1-engine-proof.md
git commit -S -m "docs(engine): Phase-1 live engine proof"
```

---

## Self-Review

**1. Spec coverage** (SPEC §6 modules + §15 findings):

| Spec element | Task |
|---|---|
| Intake (repo-native, novelty #4) | 10 |
| Discovery (reputation ranking, novelty #3) | 5 |
| Orchestrator (Pi agent-loop, CAP ops as tools) | 13 (tools) + 15 (agent) |
| QA / Critic (accept/redo/swap, novelty #3) | 9 |
| Composer (kit + derived assets) | 11 |
| Provenance (cards, novelty #2) | 8 |
| Settlement (pay/clear on Base) | 6 (hire) |
| Worklog/Events (Theater backbone, novelty #1) | 12 |
| Wallet (balance gate, findings #1) | 4 + enforced in 14 |
| Reliability / graceful degradation (§10) | partial-run handling in 16; turn backstop in 14 |
| Money safety (findings; RECTOR's agent-loop hardening) | budget 7 + guard 14 + hire caps 6 |
| Schema resolution (findings #2) | 5 (`requirementSchema`) + 13 (`get_service_schema`) |

Door A web app, Door B CAP listing, and the SSE Theater transport are **Phase 2** (out of scope here, by design). The engine emits the typed events Phase 2 will stream.

**2. Placeholder scan:** No `TODO`/`FIXME`; every code step is complete. The one genuine unknown — the image provider's deliverable shape — is handled by a complete, defensive `extractImageRef` (Task 8), not a stub; the live run (Task 17 Step 6) confirms it and any tweak lands in that one function.

**3. Type consistency:** `LegKind`, `ServiceCandidate`, `HireResult`, `Deliverable`, `LaunchAsset`, `LaunchKit`, `WorklogEvent`, `RunRecord`, `RunContext`, `CapBuyer`, `Llm`, `StreamFn`, `BudgetGuard` are defined once (Tasks 1/2/3/6/7/12) and consumed by exact name throughout. `hireSpecialist`/`buildBrief`/`reviewDeliverable`/`composeKit`/`buildTools`/`createPraecoAgent`/`runLaunchJob` signatures match across the Interfaces blocks and call sites.

**Global note for the implementer:** if any pi-ai / pi-agent-core type import fails to resolve, inspect the installed `node_modules/@earendil-works/*/dist/*.d.ts` and adjust the import to the real exported name — never invent a type or weaken a money guard to make types pass.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-27-praeco-phase1-engine.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for a 17-task plan: each task is independently testable and the reviewer gate catches drift early.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

**Which approach?**

> Note on the two live steps (Task 17, Steps 5–6): Step 5 (`engine:smoke`) calls GLM-5.2 (free) — safe to run unattended. Step 6 (`engine:run`) spends real USDC on mainnet and must be gated behind your explicit per-session authorization and a funded agent wallet, exactly like the Phase-0 `smoke:hire`.





