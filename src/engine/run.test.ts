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

// One fetch impl serving catalog discovery (GET) + the funded balance (POST eth_call).
// Service s1 matches all three legs because the scripted driver hires it for each.
const fetchImpl = (async (url: string, init?: RequestInit) => {
  if (init?.method === "POST") return new Response(JSON.stringify({ result: "0x00000000000000000000000000000000000000000000000000000000001e8480" }), { status: 200 });
  const u = String(url);
  if (u.includes("/public/agents/a1")) return new Response(JSON.stringify({ agent: { agentId: "a1", name: "ProvenAgent", completedOrders: "500", completionRate: 99, onlineStatus: "online", skillTagSlugs: [], services: [{ serviceId: "s1", name: "svc", price: "100000", requirementType: "schema", requirementSchema: JSON.stringify([{ name: "topic", type: "string", required: true }]) }] } }), { status: 200 });
  if (u.includes("/public/agents")) return new Response(JSON.stringify({ agents: [{ agentId: "a1", name: "ProvenAgent", completedOrders: "500", completionRate: 99, onlineStatus: "online", skillTagSlugs: [] }], total: "1" }), { status: 200 });
  if (u.includes("/public/services")) return new Response(JSON.stringify(u.includes("page=1") ? { items: [{ serviceId: "s1", agentId: "a1", name: "Launch Research Copy Image Studio", description: "market research, landing page copy, and og image generation", price: "100000", orders7d: "50" }], total: "1" } : { items: [], total: "1" }), { status: 200 });
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

  it("compose failure resolves with RunRecord (assets present, kit undefined, error event)", async () => {
    // LLM returns valid intake + QA verdicts, but throws on the compose prompt.
    // runLaunchJob must resolve (not reject) and preserve the RunRecord.
    const boomOnCompose: Llm = {
      completeText: async () => "",
      completeJson: (async (prompt: string) => {
        if (prompt.includes("intake analyst")) return { product: "Streaky", audience: "builders", features: ["streaks"], tone: "playful", oneLiner: "Track habits." };
        if (prompt.includes("art director")) return { action: "accept", reason: "on-brief", score: 88 };
        if (prompt.includes("composer")) throw new Error("schema validation failed");
        throw new Error("unexpected prompt: " + prompt.slice(0, 50));
      }) as Llm["completeJson"],
    };
    const rec = await runLaunchJob(
      { text: "Streaky habit tracker" },
      { ...baseDeps(), llm: boomOnCompose, drive: scriptedDriver },
    );
    // All 3 legs paid + delivered — status is completed.
    expect(rec.status).toBe("completed");
    expect(rec.assets).toHaveLength(3);
    // kit is undefined because compose threw.
    expect(rec.kit).toBeUndefined();
    // The error event must be present with the compose failure message.
    expect(rec.worklog.some((e) => e.kind === "error" && e.message.includes("compose failed"))).toBe(true);
  });
});
