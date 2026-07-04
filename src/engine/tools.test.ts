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
    getOrder: vi.fn(async () => ({ status: "created", price: "100000", deliverTxHash: "0xd" })),
    payOrder: vi.fn(async () => ({ txHash: "0xpay" })),
    getDelivery: vi.fn(async () => ({ deliverableType: "text", deliverableText:
      "Market research: indie developers want privacy-first, local-first habit tracking with no mandatory cloud, " +
      "a one-time purchase over subscriptions, and strong open-source positioning against gamified incumbents.",
      contentHash: "0xh" })),
  };
}

const candidate: ServiceCandidate = {
  serviceId: "s1", agentId: "a1", agentName: "ProofResearch", title: "Verifiable Research",
  priceBaseUnits: "100000", requirementType: "schema",
  requirementSchema: [{ name: "topic", type: "string", required: true }],
  completedOrders: 100, completionRate: 0.99,
};

function ctxFor(client: CapBuyer, llm: Llm, over: Partial<RunContext> = {}): RunContext {
  return {
    brief: { product: "Streaky", audience: "builders", features: ["x"], tone: "playful", oneLiner: "Track habits." },
    llm, client, budget: new BudgetGuard(2_000_000n, 600_000n), worklog: new Worklog(),
    config: { apiUrl: "https://api", rpcUrl: "https://rpc", agentWallet: "0xee47", usdcTokenAddress: "0x8335", preferredServiceIds: {} },
    fetchImpl: fundedFetch, requiredLegs: ["research"], hirePollOpts: { negotiationPolls: 2, deliveryPolls: 2, sleep: async () => {} },
    candidates: new Map([["s1", candidate]]), pendingHires: new Map(), verdicts: new Map(), paidOrderIds: new Set(),
    paidAttemptsByLeg: new Map(), assets: new Map(),
    ...over,
  };
}

const fakeLlm = (verdict: unknown): Llm => ({ completeText: vi.fn(async () => ""), completeJson: vi.fn(async () => verdict) as Llm["completeJson"] });
const toolMap = (ctx: RunContext) => Object.fromEntries(buildTools(ctx).map((t) => [t.name, t]));

/** Fetch stub mirroring the live CAP catalog shapes for search_marketplace tests. */
function catalogFetch(): typeof fetch {
  const services = {
    items: [
      { serviceId: "pygm-text", agentId: "pygm", name: "Pygm Studio Text Code", price: "200000", orders7d: "1401" },
      { serviceId: "pygm-image", agentId: "pygm", name: "Pygm Studio Image Code", price: "500000", orders7d: "1401" },
      { serviceId: "research-1", agentId: "zeru", name: "Verifiable Research Report", description: "market intelligence", price: "100000", orders7d: "9" },
    ],
    total: "3",
  };
  const agentsCatalog = {
    agents: [
      { agentId: "pygm", name: "Pygmalion", completedOrders: "1401", completionRate: 100, onlineStatus: "online", skillTagSlugs: ["content-creative"] },
      { agentId: "zeru", name: "ZERU", completedOrders: "9", completionRate: 100, onlineStatus: "online", skillTagSlugs: ["research-report"] },
    ],
    total: "2",
  };
  const agentRecords: Record<string, unknown> = {
    pygm: { agent: { agentId: "pygm", name: "Pygmalion", completedOrders: "1401", completionRate: 100, onlineStatus: "online", skillTagSlugs: ["content-creative"], services: [
      { serviceId: "pygm-text", name: "Pygm Studio Text Code", price: "200000", requirementType: "text", requirementSchema: "[]" },
      { serviceId: "pygm-image", name: "Pygm Studio Image Code", price: "500000", requirementType: "text", requirementSchema: "[]" },
    ] } },
    zeru: { agent: { agentId: "zeru", name: "ZERU", completedOrders: "9", completionRate: 100, onlineStatus: "online", skillTagSlugs: ["research-report"], services: [
      { serviceId: "research-1", name: "Verifiable Research Report", price: "100000", requirementType: "text", requirementSchema: "[]" },
    ] } },
  };
  return (async (url: string) => {
    const u = String(url);
    const m = u.match(/\/public\/agents\/([^/?]+)/);
    if (m) return new Response(JSON.stringify(agentRecords[m[1]] ?? {}), { status: 200 });
    if (u.includes("/public/agents")) return new Response(JSON.stringify(agentsCatalog), { status: 200 });
    if (u.includes("/public/services")) return new Response(JSON.stringify(u.includes("page=1") ? services : { items: [], total: "3" }), { status: 200 });
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("search_marketplace tool", () => {
  it("discovers ranked candidates from the catalog and caches them by serviceId", async () => {
    const ctx = ctxFor(happyClient(), fakeLlm({}));
    ctx.candidates.clear();
    ctx.fetchImpl = catalogFetch();
    const res = await toolMap(ctx).search_marketplace.execute("id", { leg: "og_image", query: "og image" });
    const ids = (res.details as any).candidates as string[];
    expect(ids[0]).toBe("pygm-image");                  // image leg picks the image service
    expect(ids).not.toContain("research-1");            // research service is irrelevant to og_image
    expect(ctx.candidates.get("pygm-image")?.priceBaseUnits).toBe("500000");
    expect(ctx.catalog).toBeDefined();                  // catalog cached on ctx
  });

  it("returns a no-candidates message when nothing matches the leg", async () => {
    const ctx = ctxFor(happyClient(), fakeLlm({}));
    ctx.candidates.clear();
    ctx.fetchImpl = (async (url: string) =>
      new Response(JSON.stringify(String(url).includes("/agents") ? { agents: [], total: "0" } : { items: [], total: "0" }), { status: 200 })) as unknown as typeof fetch;
    const res = await toolMap(ctx).search_marketplace.execute("id", { leg: "research", query: "nothing" });
    expect((res.details as any).count).toBe(0);
  });
});

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

  it("underfunded wallet blocks payment", async () => {
    const client = happyClient();
    const ctx = ctxFor(client, fakeLlm({}));
    ctx.fetchImpl = (async () =>
      new Response(JSON.stringify({ result: "0x0000000000000000000000000000000000000000000000000000000000000000" }), { status: 200 })) as unknown as typeof fetch;
    await expect(
      toolMap(ctx).hire_specialist.execute("id", { leg: "research", serviceId: "s1", requirements: { topic: "x" } }),
    ).rejects.toThrow(/fund the agent wallet/i);
    expect(client.payOrder).not.toHaveBeenCalled();
  });

  it("budget exhausted blocks payment", async () => {
    const client = happyClient();
    const ctx = ctxFor(client, fakeLlm({}));
    ctx.budget = new BudgetGuard(50_000n, 600_000n);
    await expect(
      toolMap(ctx).hire_specialist.execute("id", { leg: "research", serviceId: "s1", requirements: { topic: "x" } }),
    ).rejects.toThrow(/exceeds remaining run budget/i);
    expect(client.payOrder).not.toHaveBeenCalled();
  });

  it("delivery timeout: budget is committed (onPaid fired) even though the tool execute rejects", async () => {
    const client = happyClient();
    // Order finalizes (payable) but the provider never delivers — simulates a stall after payment.
    client.getOrder = vi.fn(async () => ({ status: "created", price: "100000" }));
    const ctx = ctxFor(client, fakeLlm({}));
    await expect(
      toolMap(ctx).hire_specialist.execute("id", { leg: "research", serviceId: "s1", requirements: { topic: "habits" } }),
    ).rejects.toThrow(/did not deliver/);
    // onPaid fired via the callback — spend is recorded in the ledger.
    expect(ctx.budget.spent).toBe(100_000n);
    expect(ctx.paidOrderIds.has("o1")).toBe(true);
    // pendingHires must NOT have an entry since delivery never completed.
    expect(ctx.pendingHires.has("o1")).toBe(false);
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

describe("§7 cap wiring", () => {
  it("increments paidAttemptsByLeg when a hire is paid", async () => {
    const ctx = ctxFor(happyClient(), fakeLlm({}));
    await toolMap(ctx).hire_specialist.execute("id", { leg: "research", serviceId: "s1", requirements: { topic: "x" } });
    expect(ctx.paidAttemptsByLeg.get("research")).toBe(1);
  });
});
