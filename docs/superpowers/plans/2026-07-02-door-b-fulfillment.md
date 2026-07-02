# Door B — Fulfillment CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Praeco a callable CAP *seller* — a `door-b:fulfill` CLI that picks up a paid inbound order, runs the same `runLaunchJob` engine, and delivers the kit on-chain — built and fully tested at $0 against a mock provider + sandbox engine.

**Architecture:** A narrow `CapProvider` interface (mirrors the proven `CapBuyer`) wraps the SDK's seller methods; `fulfillOrder()` is a pure, injected-dependency core (accept → wait-for-paid → run → deliver); the CLI wires the real `AgentClient` + live engine deps, or `--sim` → mock provider + sandbox engine. The engine (`src/*`) is unchanged; `runLaunchJob` is the shared entry with Door A.

**Tech Stack:** TypeScript, `@croo-network/sdk` v0.2.1 (`AgentClient` seller methods), Vitest, tsx.

## Global Constraints

- **Do NOT modify `src/engine/*` or `src/llm/*`** — the engine is proven. New seller code lives in `src/cap/`, `server/`, `scripts/`.
- TDD every unit; `pnpm test:run` + `pnpm typecheck` green before every commit. Keep the existing 141 tests green.
- Commits GPG-signed (`git commit -S`, key `BF47B9DC1FA320FA`); **NO AI attribution** anywhere. One commit per logical unit.
- CROO is **mainnet only**; CI mocks the SDK — **no live USDC, no real network in tests**. Phase 1 (build) is entirely $0.
- Deliverable types are **`"text"` | `"schema"` only**; `contentHash` is returned by the backend, never set by us.
- Money invariant: **run the engine only after `getOrder.status === "paid"`** (Praeco is +$2 before spending ~$0.70).
- **One `AgentClient` / one WS per `CROO_SDK_KEY`** — the CLI shares a single client between the provider role and the engine's buyer role (a second WS on the same key dies with close-1008).

---

## File Structure

| Path | Responsibility | Action |
|---|---|---|
| `src/cap/provider.ts` | `CapProvider` interface + `AgentClientProvider` wrapper (seller ops over `AgentClient`) | Create |
| `src/cap/mock-provider.ts` | `mockProvider()` — simulates one paid inbound order (sim + TDD) | Create |
| `server/kit-markdown.ts` | `kitToMarkdown(RunRecord)` + `kitProvenanceJson(RunRecord)` (pure) | Create |
| `server/fulfill-order.ts` | `fulfillOrder(deps)` — accept→wait-paid→run→deliver core | Create |
| `server/engine-deps.ts` | add `buildLiveDepsWith(client, onEvent, runId)` — reuse an existing client (WS-collision fix) | Modify |
| `scripts/door-b-fulfill.ts` | CLI: real provider + live deps, or `--sim`/`--watch` | Create |
| `package.json` | add `"door-b:fulfill"` + `"door-b:sim"` scripts | Modify |

**Shared types** (already defined — do not redefine): `RunRecord`, `LaunchKit`, `ProvenanceCard`, `IntakeInput` (`src/types.ts`, `src/engine/intake.ts`); `CapBuyer` (`src/cap/hire.ts:9`).

---

## Phase 1 — Build (TDD, $0)

### Task 1: `CapProvider` interface + `AgentClientProvider` wrapper

**Files:**
- Create: `src/cap/provider.ts`
- Test: `src/cap/provider.test.ts`

**Interfaces:**
- Produces:
  - `interface CapProvider { listInboundNegotiations(): Promise<InboundNegotiation[]>; acceptNegotiation(negotiationId: string, providerFundAddress?: string): Promise<{ orderId: string }>; rejectNegotiation(negotiationId: string, reason: string): Promise<void>; getOrder(orderId: string): Promise<{ status: string; price?: string }>; deliverOrder(orderId: string, req: DeliverReq): Promise<{ contentHash: string }>; rejectOrder(orderId: string, reason: string): Promise<void>; }`
  - `interface InboundNegotiation { negotiationId: string; status: string; requirements: string; requireFundTransfer?: boolean }`
  - `interface DeliverReq { deliverableType: string; deliverableText?: string; deliverableSchema?: string }`
  - `class AgentClientProvider implements CapProvider` — constructed with the SDK `AgentClient`.

- [ ] **Step 1: Write the failing test**

```ts
// src/cap/provider.test.ts
import { describe, it, expect, vi } from "vitest";
import { AgentClientProvider } from "./provider.js";

const client = {
  listNegotiations: vi.fn(async () => [{ negotiationId: "n1", status: "pending", requirements: '{"brief":"x"}', requireFundTransfer: false }]),
  acceptNegotiation: vi.fn(async () => ({ order: { orderId: "o1" } })),
  acceptNegotiationWithFundAddress: vi.fn(async () => ({ order: { orderId: "o2" } })),
  rejectNegotiation: vi.fn(async () => {}),
  getOrder: vi.fn(async () => ({ status: "paid", price: "2000000" })),
  deliverOrder: vi.fn(async () => ({ delivery: { contentHash: "0xhash" } })),
  rejectOrder: vi.fn(async () => {}),
};

describe("AgentClientProvider", () => {
  it("lists inbound provider negotiations (role=provider, status=pending)", async () => {
    const p = new AgentClientProvider(client as never);
    const out = await p.listInboundNegotiations();
    expect(client.listNegotiations).toHaveBeenCalledWith({ role: "provider", status: "pending" });
    expect(out[0]).toEqual({ negotiationId: "n1", status: "pending", requirements: '{"brief":"x"}', requireFundTransfer: false });
  });
  it("accepts a negotiation and returns the orderId", async () => {
    const p = new AgentClientProvider(client as never);
    expect(await p.acceptNegotiation("n1")).toEqual({ orderId: "o1" });
    expect(client.acceptNegotiation).toHaveBeenCalledWith("n1");
  });
  it("uses the fund-address accept when a provider fund address is given", async () => {
    const p = new AgentClientProvider(client as never);
    expect(await p.acceptNegotiation("n1", "0xfund")).toEqual({ orderId: "o2" });
    expect(client.acceptNegotiationWithFundAddress).toHaveBeenCalledWith("n1", "0xfund");
  });
  it("delivers and returns the backend contentHash", async () => {
    const p = new AgentClientProvider(client as never);
    const r = await p.deliverOrder("o1", { deliverableType: "text", deliverableText: "kit" });
    expect(client.deliverOrder).toHaveBeenCalledWith("o1", { deliverableType: "text", deliverableText: "kit" });
    expect(r).toEqual({ contentHash: "0xhash" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/cap/provider.test.ts`
Expected: FAIL (`./provider.js` missing).

- [ ] **Step 3: Implement the wrapper**

```ts
// src/cap/provider.ts
// Seller-side CAP surface, narrow + mockable (mirrors CapBuyer). Wraps the SDK
// AgentClient's provider methods. Field access is validated by the Phase-2 mainnet
// spike; the core logic is tested against the mock, not the live SDK.
export interface InboundNegotiation { negotiationId: string; status: string; requirements: string; requireFundTransfer?: boolean }
export interface DeliverReq { deliverableType: string; deliverableText?: string; deliverableSchema?: string }
export interface CapProvider {
  listInboundNegotiations(): Promise<InboundNegotiation[]>;
  acceptNegotiation(negotiationId: string, providerFundAddress?: string): Promise<{ orderId: string }>;
  rejectNegotiation(negotiationId: string, reason: string): Promise<void>;
  getOrder(orderId: string): Promise<{ status: string; price?: string }>;
  deliverOrder(orderId: string, req: DeliverReq): Promise<{ contentHash: string }>;
  rejectOrder(orderId: string, reason: string): Promise<void>;
}

// Minimal shape of the SDK client we depend on (avoids importing SDK types here).
interface SdkClient {
  listNegotiations(opts: { role: string; status?: string }): Promise<Array<{ negotiationId: string; status: string; requirements?: string; requireFundTransfer?: boolean }>>;
  acceptNegotiation(id: string): Promise<{ order: { orderId: string } }>;
  acceptNegotiationWithFundAddress(id: string, addr: string): Promise<{ order: { orderId: string } }>;
  rejectNegotiation(id: string, reason: string): Promise<void>;
  getOrder(id: string): Promise<{ status: string; price?: string }>;
  deliverOrder(id: string, req: DeliverReq): Promise<{ delivery: { contentHash: string } }>;
  rejectOrder(id: string, reason: string): Promise<void>;
}

export class AgentClientProvider implements CapProvider {
  constructor(private readonly client: SdkClient) {}
  async listInboundNegotiations(): Promise<InboundNegotiation[]> {
    const ns = await this.client.listNegotiations({ role: "provider", status: "pending" });
    return ns.map((n) => ({ negotiationId: n.negotiationId, status: n.status, requirements: n.requirements ?? "", requireFundTransfer: n.requireFundTransfer }));
  }
  async acceptNegotiation(negotiationId: string, providerFundAddress?: string): Promise<{ orderId: string }> {
    const res = providerFundAddress
      ? await this.client.acceptNegotiationWithFundAddress(negotiationId, providerFundAddress)
      : await this.client.acceptNegotiation(negotiationId);
    return { orderId: res.order.orderId };
  }
  rejectNegotiation(negotiationId: string, reason: string) { return this.client.rejectNegotiation(negotiationId, reason); }
  getOrder(orderId: string) { return this.client.getOrder(orderId); }
  async deliverOrder(orderId: string, req: DeliverReq): Promise<{ contentHash: string }> {
    const res = await this.client.deliverOrder(orderId, req);
    return { contentHash: res.delivery.contentHash };
  }
  rejectOrder(orderId: string, reason: string) { return this.client.rejectOrder(orderId, reason); }
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm exec vitest run src/cap/provider.test.ts && pnpm typecheck`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add src/cap/provider.ts src/cap/provider.test.ts
git commit -S -m "feat(cap): CapProvider seller interface + AgentClient wrapper"
```

### Task 2: `mockProvider` (sim + TDD driver)

**Files:**
- Create: `src/cap/mock-provider.ts`
- Test: `src/cap/mock-provider.test.ts`

**Interfaces:**
- Consumes: `CapProvider`, `InboundNegotiation` (Task 1).
- Produces: `mockProvider(opts?: { brief?: string; paysAfter?: number }): CapProvider & { delivered: DeliverReq[] }` — one pending negotiation carrying `{brief}`; `getOrder` returns `"creating"` for the first `paysAfter` calls then `"paid"`; `deliverOrder` records the delivery and returns a fake hash.

- [ ] **Step 1: Write the failing test**

```ts
// src/cap/mock-provider.test.ts
import { describe, it, expect } from "vitest";
import { mockProvider } from "./mock-provider.js";

describe("mockProvider", () => {
  it("exposes one pending negotiation with the given brief", async () => {
    const p = mockProvider({ brief: "a habit tracker" });
    const ns = await p.listInboundNegotiations();
    expect(ns).toHaveLength(1);
    expect(JSON.parse(ns[0].requirements)).toEqual({ brief: "a habit tracker" });
  });
  it("accept returns an orderId; order pays after N polls", async () => {
    const p = mockProvider({ paysAfter: 2 });
    const { orderId } = await p.acceptNegotiation("mock-neg");
    expect((await p.getOrder(orderId)).status).toBe("creating");
    expect((await p.getOrder(orderId)).status).toBe("creating");
    expect((await p.getOrder(orderId)).status).toBe("paid");
  });
  it("records deliveries and returns a contentHash", async () => {
    const p = mockProvider();
    const r = await p.deliverOrder("mock-order", { deliverableType: "text", deliverableText: "kit" });
    expect(r.contentHash).toMatch(/^0x/);
    expect(p.delivered[0].deliverableText).toBe("kit");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/cap/mock-provider.test.ts`
Expected: FAIL (missing module).

- [ ] **Step 3: Implement the mock**

```ts
// src/cap/mock-provider.ts
import type { CapProvider, DeliverReq, InboundNegotiation } from "./provider.js";

export function mockProvider(opts: { brief?: string; paysAfter?: number } = {}): CapProvider & { delivered: DeliverReq[] } {
  const brief = opts.brief ?? "A privacy-first habit tracker for indie developers";
  const paysAfter = opts.paysAfter ?? 0;
  const delivered: DeliverReq[] = [];
  let polls = 0;
  let listed = false;
  return {
    delivered,
    async listInboundNegotiations(): Promise<InboundNegotiation[]> {
      if (listed) return []; // one-shot: disappears after it's picked up
      return [{ negotiationId: "mock-neg", status: "pending", requirements: JSON.stringify({ brief }) }];
    },
    async acceptNegotiation() { listed = true; return { orderId: "mock-order" }; },
    async rejectNegotiation() { listed = true; },
    async getOrder() { const status = polls++ < paysAfter ? "creating" : "paid"; return { status, price: "2000000" }; },
    async deliverOrder(_orderId: string, req: DeliverReq) { delivered.push(req); return { contentHash: `0xmockdeliverhash${delivered.length}` }; },
    async rejectOrder() {},
  };
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm exec vitest run src/cap/mock-provider.test.ts && pnpm typecheck`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add src/cap/mock-provider.ts src/cap/mock-provider.test.ts
git commit -S -m "feat(cap): mock CapProvider for sim + tests"
```

### Task 3: `kitToMarkdown` + `kitProvenanceJson`

**Files:**
- Create: `server/kit-markdown.ts`
- Test: `server/kit-markdown.test.ts`

**Interfaces:**
- Consumes: `RunRecord`, `LaunchKit`, `ProvenanceCard` (`src/types.ts`).
- Produces: `kitToMarkdown(rec: RunRecord): string`, `kitProvenanceJson(rec: RunRecord): string`.

- [ ] **Step 1: Write the failing test**

```ts
// server/kit-markdown.test.ts
import { describe, it, expect } from "vitest";
import { kitToMarkdown, kitProvenanceJson } from "./kit-markdown.js";

const rec = {
  runId: "run-1", status: "completed",
  brief: { product: "Streaky", audience: "indie devs", features: ["local"], tone: "calm", oneLiner: "Local-first habits." },
  assets: [], spentBaseUnits: "700000", startedAt: 1, endedAt: 2, worklog: [],
  kit: {
    landingCopy: "Headline: Streaky", ogImageRef: "hash:0ximg", tweetThread: ["t1", "t2"],
    shortPitch: "Local-first habits.", phHnBlurb: "PH blurb", readmePolish: "# Streaky",
    provenance: [{ leg: "research", agentId: "a", agentName: "Foundr", amountUsd: "0.10", contentHash: "0xh", payTxHash: "0xp", basescanUrl: "https://basescan.org/tx/0xp" }],
  },
} as never;

describe("kit-markdown", () => {
  it("renders the kit sections as markdown", () => {
    const md = kitToMarkdown(rec);
    expect(md).toContain("Streaky");
    expect(md).toContain("Headline: Streaky");
    expect(md).toContain("t1");
    expect(md).toContain("Foundr");
    expect(md).toContain("basescan.org/tx/0xp");
  });
  it("notes graceful degradation when there is no kit", () => {
    const md = kitToMarkdown({ ...rec, status: "failed", kit: undefined } as never);
    expect(md).toMatch(/no kit|failed|partial/i);
  });
  it("emits provenance JSON", () => {
    const j = JSON.parse(kitProvenanceJson(rec));
    expect(j.runId).toBe("run-1");
    expect(j.provenance[0].agentName).toBe("Foundr");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run server/kit-markdown.test.ts`
Expected: FAIL (missing module).

- [ ] **Step 3: Implement**

```ts
// server/kit-markdown.ts
import type { RunRecord } from "@/src/types";

export function kitToMarkdown(rec: RunRecord): string {
  const b = rec.brief;
  const head = `# ${b.product}\n\n> ${b.oneLiner}\n\n_Audience: ${b.audience} · Tone: ${b.tone}_\n`;
  if (!rec.kit) {
    return `${head}\n**Run status: ${rec.status}.** No composed kit was produced${rec.assets.length ? " — some legs completed, see provenance." : "."}\n`;
  }
  const k = rec.kit;
  const prov = k.provenance.map((p) => `- **${p.leg}** — ${p.agentName} · $${p.amountUsd} · \`${p.contentHash}\` · [Basescan ↗](${p.basescanUrl})`).join("\n");
  return [
    head,
    `## Landing copy\n\n${k.landingCopy || "(none)"}`,
    `## OG image\n\n${/^https?:\/\//.test(k.ogImageRef) ? `![og image](${k.ogImageRef})` : `Asset reference: \`${k.ogImageRef}\``}`,
    `## Tweet thread\n\n${k.tweetThread.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
    `## Short pitch\n\n${k.shortPitch}`,
    `## Product Hunt / HN blurb\n\n${k.phHnBlurb}`,
    `## README intro\n\n${k.readmePolish}`,
    `## Provenance (on-chain)\n\n${prov}`,
    `\n_Delivered by Praeco — run ${rec.runId} · spent $${(Number(rec.spentBaseUnits) / 1e6).toFixed(2)} USDC._`,
  ].join("\n\n");
}

export function kitProvenanceJson(rec: RunRecord): string {
  return JSON.stringify({ runId: rec.runId, status: rec.status, spentBaseUnits: rec.spentBaseUnits, provenance: rec.kit?.provenance ?? rec.assets.map((a) => a.provenance) }, null, 2);
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm exec vitest run server/kit-markdown.test.ts && pnpm typecheck`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add server/kit-markdown.ts server/kit-markdown.test.ts
git commit -S -m "feat(web): kit → markdown + provenance JSON for Door B delivery"
```

### Task 4: `fulfillOrder` core

**Files:**
- Create: `server/fulfill-order.ts`
- Test: `server/fulfill-order.test.ts`

**Interfaces:**
- Consumes: `CapProvider` (Task 1), `kitToMarkdown`/`kitProvenanceJson` (Task 3), `RunRecord`/`IntakeInput`.
- Produces:
  - `interface FulfillDeps { provider: CapProvider; runJob: (input: IntakeInput) => Promise<RunRecord>; assertFunded?: () => Promise<void>; poll?: { attempts: number; delayMs: number; sleep?: (ms: number) => Promise<void> }; onLog?: (m: string) => void }`
  - `interface FulfillResult { status: "delivered" | "rejected" | "skipped"; orderId?: string; contentHash?: string; reason?: string }`
  - `fulfillOrder(deps: FulfillDeps): Promise<FulfillResult>`

- [ ] **Step 1: Write the failing tests**

```ts
// server/fulfill-order.test.ts
import { describe, it, expect, vi } from "vitest";
import { fulfillOrder } from "./fulfill-order.js";
import { mockProvider } from "@/src/cap/mock-provider";

const rec = (status = "completed", kit = true) => ({
  runId: "run-x", status, brief: { product: "P", audience: "a", features: [], tone: "t", oneLiner: "o" },
  assets: kit ? [{}] : [], spentBaseUnits: "700000", startedAt: 1, endedAt: 2, worklog: [],
  kit: kit ? { landingCopy: "c", ogImageRef: "hash:0x", tweetThread: ["t"], shortPitch: "s", phHnBlurb: "p", readmePolish: "r", provenance: [] } : undefined,
}) as never;
const noSleep = { attempts: 5, delayMs: 0, sleep: async () => {} };

describe("fulfillOrder", () => {
  it("accepts, waits for paid, runs, delivers, returns contentHash", async () => {
    const provider = mockProvider({ brief: "a habit tracker", paysAfter: 1 });
    const runJob = vi.fn(async () => rec());
    const out = await fulfillOrder({ provider, runJob, poll: noSleep });
    expect(runJob).toHaveBeenCalledWith({ text: "a habit tracker" });
    expect(out.status).toBe("delivered");
    expect(out.contentHash).toMatch(/^0x/);
    expect(provider.delivered[0].deliverableText).toContain("habit"); // brief flows into the kit md? at least product/pitch present
  });
  it("does NOT run the engine if the order never gets paid", async () => {
    const provider = mockProvider({ paysAfter: 99 });
    const runJob = vi.fn(async () => rec());
    const out = await fulfillOrder({ provider, runJob, poll: { attempts: 3, delayMs: 0, sleep: async () => {} } });
    expect(runJob).not.toHaveBeenCalled();
    expect(out.status).toBe("skipped");
  });
  it("rejects a negotiation with no brief (never accepts)", async () => {
    const provider = mockProvider({ brief: "" });
    // brief "" → requirements {brief:""} → invalid
    const acceptSpy = vi.spyOn(provider, "acceptNegotiation");
    const rejectSpy = vi.spyOn(provider, "rejectNegotiation");
    const out = await fulfillOrder({ provider, runJob: vi.fn(async () => rec()), poll: noSleep });
    expect(acceptSpy).not.toHaveBeenCalled();
    expect(rejectSpy).toHaveBeenCalled();
    expect(out.status).toBe("rejected");
  });
  it("skips cleanly when there are no inbound negotiations", async () => {
    const provider = { ...mockProvider(), listInboundNegotiations: async () => [] } as never;
    const out = await fulfillOrder({ provider, runJob: vi.fn(async () => rec()), poll: noSleep });
    expect(out.status).toBe("skipped");
  });
  it("still delivers a partial run with a note", async () => {
    const provider = mockProvider({ paysAfter: 0 });
    const out = await fulfillOrder({ provider, runJob: async () => rec("partial", false), poll: noSleep });
    expect(out.status).toBe("delivered");
    expect(provider.delivered[0].deliverableText).toMatch(/partial/i);
  });
  it("calls assertFunded before accepting", async () => {
    const provider = mockProvider({ paysAfter: 0 });
    const assertFunded = vi.fn(async () => {});
    await fulfillOrder({ provider, runJob: async () => rec(), assertFunded, poll: noSleep });
    expect(assertFunded).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run server/fulfill-order.test.ts`
Expected: FAIL (missing module).

- [ ] **Step 3: Implement the core**

```ts
// server/fulfill-order.ts
import type { CapProvider } from "@/src/cap/provider";
import type { RunRecord } from "@/src/types";
import type { IntakeInput } from "@/src/engine/intake";
import { kitToMarkdown, kitProvenanceJson } from "./kit-markdown.js";

export interface FulfillDeps {
  provider: CapProvider;
  runJob: (input: IntakeInput) => Promise<RunRecord>;
  assertFunded?: () => Promise<void>;
  poll?: { attempts: number; delayMs: number; sleep?: (ms: number) => Promise<void> };
  onLog?: (m: string) => void;
}
export interface FulfillResult { status: "delivered" | "rejected" | "skipped"; orderId?: string; contentHash?: string; reason?: string }

function parseBrief(requirements: string): IntakeInput | null {
  try {
    const r = JSON.parse(requirements) as { brief?: unknown };
    const brief = typeof r.brief === "string" ? r.brief.trim() : "";
    if (brief.length < 3) return null;
    return /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(brief) ? { repoUrl: brief } : { text: brief };
  } catch { return null; }
}

export async function fulfillOrder(deps: FulfillDeps): Promise<FulfillResult> {
  const log = deps.onLog ?? (() => {});
  const poll = deps.poll ?? { attempts: 40, delayMs: 3000 };
  const sleep = poll.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  const inbound = await deps.provider.listInboundNegotiations();
  if (inbound.length === 0) { log("no inbound negotiations"); return { status: "skipped", reason: "no inbound" }; }

  const n = inbound[0];
  const input = parseBrief(n.requirements);
  if (!input) {
    await deps.provider.rejectNegotiation(n.negotiationId, "requirements missing a valid 'brief'");
    log(`rejected ${n.negotiationId}: invalid brief`);
    return { status: "rejected", reason: "invalid brief" };
  }

  if (deps.assertFunded) await deps.assertFunded(); // accept costs provider gas
  const { orderId } = await deps.provider.acceptNegotiation(n.negotiationId, n.requireFundTransfer ? deps.provider ? undefined : undefined : undefined);
  log(`accepted ${n.negotiationId} → order ${orderId}`);

  // Wait for the buyer to pay before spending a cent.
  let paid = false;
  for (let i = 0; i < poll.attempts; i++) {
    const o = await deps.provider.getOrder(orderId);
    if (o.status === "paid" || o.status === "delivering" || o.status === "completed") { paid = true; break; }
    if (["rejected", "cancelled", "canceled", "expired", "refunded", "failed"].includes(o.status)) {
      log(`order ${orderId} ended ${o.status} before payment`);
      return { status: "skipped", orderId, reason: `unpaid (${o.status})` };
    }
    await sleep(poll.delayMs);
  }
  if (!paid) { log(`order ${orderId} not paid within window`); return { status: "skipped", orderId, reason: "payment timeout" }; }

  const rec = await deps.runJob(input); // spends ~$0.70 — only now, post-payment
  const text = kitToMarkdown(rec);
  const schema = kitProvenanceJson(rec);
  const { contentHash } = await deps.provider.deliverOrder(orderId, { deliverableType: "text", deliverableText: text, deliverableSchema: schema });
  log(`delivered order ${orderId} (${rec.status}) — contentHash ${contentHash}`);
  return { status: "delivered", orderId, contentHash };
}
```

> Note: `requireFundTransfer` handling is stubbed to the default accept here (the fund-address path needs a provider fund address from config, added in Task 5 if the spike shows `require_fund_transfer:true` on our service; our `{brief}` service will be created with it **false**, so the default accept is correct — the Task-1 wrapper still supports the fund-address variant).

- [ ] **Step 4: Simplify the accept call**

Replace the convoluted `acceptNegotiation(...)` line with the clean default (our service is created with `require_fund_transfer:false`):
```ts
  const { orderId } = await deps.provider.acceptNegotiation(n.negotiationId);
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm exec vitest run server/fulfill-order.test.ts && pnpm typecheck`
Expected: PASS (all 6); clean.

- [ ] **Step 6: Commit**

```bash
git add server/fulfill-order.ts server/fulfill-order.test.ts
git commit -S -m "feat(web): fulfillOrder core — accept→wait-paid→run→deliver (money-safe)"
```

### Task 5: `buildLiveDepsWith` + the CLI

**Files:**
- Modify: `server/engine-deps.ts`
- Create: `scripts/door-b-fulfill.ts`
- Modify: `package.json` (scripts)
- Test: `server/engine-deps.test.ts` (extend — assert the new builder reuses the passed client)

**Interfaces:**
- Consumes: `AgentClientProvider` (Task 1), `mockProvider` (Task 2), `fulfillOrder` (Task 4), `runLaunchJob`, `assertFunded` (`src/cap/wallet.ts`), `loadConfig`.
- Produces: `buildLiveDepsWith(client, onEvent, runId): RunDeps` (reuses an existing `AgentClient` — no second WS); the CLI (`--sim`, `--watch`).

- [ ] **Step 1: Write the failing test for `buildLiveDepsWith`**

```ts
// server/engine-deps.test.ts (add)
import { describe, it, expect, vi } from "vitest";
vi.mock("@/src/config", () => ({ loadConfig: () => ({ crooApiUrl: "u", crooWsUrl: "w", crooSdkKey: "k", baseRpcUrl: "r", ollamaApiKey: "o", ollamaBaseUrl: "b", praecoAgentId: "id", praecoAgentWallet: "0x0", usdcTokenAddress: "0xu", runBudgetUsdc: "2.00", legCapUsdc: "0.60", preferredServiceIds: {} }) }));
vi.mock("@/src/llm/model", () => ({ createGlmModels: () => ({ models: { complete: vi.fn() }, model: {}, streamFn: vi.fn() }) }));
vi.mock("@/src/llm/llm", () => ({ createLlm: () => ({}) }));

it("buildLiveDepsWith reuses the passed client (no new AgentClient/WS)", async () => {
  const { buildLiveDepsWith } = await import("./engine-deps.js");
  const client = { marker: "shared" };
  const deps = buildLiveDepsWith(client as never, () => {}, "run-1");
  expect(deps.client).toBe(client);
  expect(deps.runId).toBe("run-1");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run server/engine-deps.test.ts`
Expected: FAIL (`buildLiveDepsWith` not exported).

- [ ] **Step 3: Add `buildLiveDepsWith` to `server/engine-deps.ts`**

```ts
// server/engine-deps.ts — add (keep existing buildSandboxDeps / buildLiveDeps):
import type { CapBuyer } from "@/src/cap/hire";
// (glm() + imports already exist in this file)

/** Build live engine deps that REUSE an existing AgentClient — so the Door B
 *  provider WS and the engine's buyer role share ONE connection on the SDK key
 *  (a second WS on the same key is fatal, close-1008). */
export function buildLiveDepsWith(client: unknown, onEvent: (e: import("@/src/types").WorklogEvent) => void, runId: string) {
  const config = loadConfig();
  const { model, streamFn, llm } = glm();
  return {
    config, llm, client: client as CapBuyer, model, streamFn,
    fetchImpl: fetch as import("@/src/cap/wallet").FetchFn, onEvent, runId,
    hirePollOpts: { negotiationPolls: 80, negotiationDelayMs: 2000, deliveryPolls: 120, deliveryDelayMs: 5000 },
  };
}
```

- [ ] **Step 4: Run the test + typecheck**

Run: `pnpm exec vitest run server/engine-deps.test.ts && pnpm typecheck`
Expected: PASS; clean.

- [ ] **Step 5: Write the CLI**

```ts
// scripts/door-b-fulfill.ts
// Door B fulfillment CLI. Real: one shared AgentClient (provider + buyer roles, one WS).
// --sim: mock provider + sandbox engine ($0, no chain). --watch: poll loop.
import "dotenv/config";
import { AgentClient } from "@croo-network/sdk";
import { loadConfig } from "../src/config.js";
import { runLaunchJob } from "../src/engine/run.js";
import { AgentClientProvider } from "../src/cap/provider.js";
import { mockProvider } from "../src/cap/mock-provider.js";
import { assertFunded } from "../src/cap/wallet.js";
import { buildSandboxDeps, buildLiveDepsWith } from "../server/engine-deps.js";
import { fulfillOrder } from "../server/fulfill-order.js";
import type { IntakeInput } from "../src/engine/intake.js";

const sim = process.argv.includes("--sim");
const watch = process.argv.includes("--watch");
const log = (m: string) => console.log(`[door-b] ${m}`);

async function once() {
  if (sim) {
    const provider = mockProvider({ brief: "A privacy-first habit tracker for indie developers" });
    const runJob = (input: IntakeInput) => runLaunchJob(input, buildSandboxDeps(() => {}, `live-${Date.now()}`));
    return fulfillOrder({ provider, runJob, poll: { attempts: 10, delayMs: 200 }, onLog: log });
  }
  const cfg = loadConfig();
  const client = new AgentClient({ baseURL: cfg.crooApiUrl, wsURL: cfg.crooWsUrl, rpcURL: cfg.baseRpcUrl }, cfg.crooSdkKey);
  await client.connectWebSocket(); // presence; providers won't transact with an offline agent
  try {
    const provider = new AgentClientProvider(client as never);
    const runJob = (input: IntakeInput) =>
      runLaunchJob(input, buildLiveDepsWith(client, () => {}, `live-${Date.now()}`)); // shared client — one WS
    const assertFundedFn = () => assertFunded(cfg.baseRpcUrl, cfg.praecoAgentWallet, cfg.usdcTokenAddress, 1n, fetch as never);
    return await fulfillOrder({ provider, runJob, assertFunded: assertFundedFn, onLog: log });
  } finally {
    (client as unknown as { close?: () => void }).close?.();
  }
}

async function main() {
  if (!watch) { const r = await once(); log(`result: ${JSON.stringify(r)}`); return; }
  log("watch mode — polling every 15s (Ctrl-C to stop)");
  for (;;) { const r = await once(); if (r.status !== "skipped") log(`result: ${JSON.stringify(r)}`); await new Promise((s) => setTimeout(s, 15000)); }
}
main().catch((e) => { console.error("[door-b] fatal:", (e as Error).message); process.exit(1); });
```

- [ ] **Step 6: Add package.json scripts**

Add to `scripts`: `"door-b:sim": "tsx scripts/door-b-fulfill.ts --sim"`, `"door-b:fulfill": "tsx scripts/door-b-fulfill.ts"`.

- [ ] **Step 7: Sim smoke ($0) + full suite + typecheck**

Run: `pnpm door-b:sim`
Expected: logs `accepted … → order mock-order`, `delivered order mock-order (completed) — contentHash 0x…`, `result: {"status":"delivered",...}` (a real GLM sandbox run happens end-to-end, mock CAP, $0).
Run: `pnpm test:run && pnpm typecheck`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add server/engine-deps.ts server/engine-deps.test.ts scripts/door-b-fulfill.ts package.json
git commit -S -m "feat(door-b): fulfillment CLI (--sim/--watch) — shared client, sandbox smoke"
```

---

## Phase 2 — Mainnet runtime (GATED — needs RECTOR)

> Not TDD — a live on-chain operation. Do ONLY after: (1) RECTOR dashboard-registers the service, (2) the agent wallet is topped up, (3) a buyer wallet is ready. This is the spec's §12 mainnet runtime spike **and** the mandatory proof, combined.

### Task 6: Register + real fulfillment proof

- [ ] **Step 1 (RECTOR):** At agent.croo.network under agent `ce5362ad…`, register a service: name "Praeco — launch kit", requirement schema `{ brief: string }`, price `2.00` USDC, `deliverableType: text`, + avatar. Record the `serviceId` and confirm `require_fund_transfer: false`.
- [ ] **Step 2 (RECTOR):** Top up the agent wallet `0xee47…7D31` (≥ ~$3 USDC: accept-gas + ~$0.70 hires + headroom).
- [ ] **Step 3:** Verify field mapping — run `pnpm door-b:fulfill` once with NO inbound order; confirm it connects (WS presence) + `listInboundNegotiations()` returns `[]` cleanly (validates the real `listNegotiations({role:'provider',status:'pending'})` shape). Fix any field-name drift in `AgentClientProvider` if the SDK differs from the `.d.ts`.
- [ ] **Step 4 (RECTOR + CIPHER):** From a buyer wallet, place a ~$2 order against the Praeco service with a `brief`. Then run `pnpm door-b:fulfill` → it accepts, waits for payment, runs the live engine, delivers, and logs the `orderId` + `contentHash` + deliver txHash.
- [ ] **Step 5:** Capture the on-chain proof (order id, contentHash, Basescan links) into `docs/superpowers/specs/2026-07-02-door-b-proof.md` (mirrors the Phase-1 proof doc). Commit.

---

## Self-Review

**Spec coverage:** §2 seller runtime → Task 1; §4 components → Tasks 1–5; §5 flow → Task 4; §6 deliverable format → Task 3 (+ graceful degradation in Task 4); §7 money-safety (spend-after-paid, assertFunded) → Task 4; §7 shared-client/WS → Task 5 (`buildLiveDepsWith`); §9 testing → Tasks 1–5; §10 prerequisites + §12 mainnet spike → Phase 2. All covered.

**Placeholder scan:** every code step has real code; the one `requireFundTransfer` stub is resolved inline in Task 4 Step 4. No TBD/"add error handling"/"similar to".

**Type consistency:** `CapProvider` (Task 1) is the type consumed by `mockProvider` (Task 2) and `fulfillOrder` (Task 4); `FulfillDeps.runJob: (IntakeInput) => Promise<RunRecord>` matches the CLI's `runJob` wiring (Task 5); `kitToMarkdown(rec)`/`kitProvenanceJson(rec)` names match Task 3 ↔ Task 4; `deliverOrder(orderId, {deliverableType, deliverableText?, deliverableSchema?})` consistent across Tasks 1/2/4. `buildLiveDepsWith(client, onEvent, runId)` consistent Task 5 def ↔ CLI use.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-02-door-b-fulfillment.md`.
