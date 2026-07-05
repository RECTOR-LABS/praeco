import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLaunchJob, type EngineDriver } from "./run.js";
import { buildTools } from "./tools.js";
import { makeBeforeToolCall } from "./guard.js";
import type { RunContext } from "./context.js";
import type { Config } from "../config.js";
import type { Llm } from "../llm/llm.js";
import type { CapBuyer } from "../cap/hire.js";

// Every runLaunchJob call now loads/saves a reputation store at run end (Task 6).
// Isolate ALL tests in this file (both describe blocks below) to a per-test temp
// file so no run — scripted, capped, or otherwise — ever writes the repo's ./runs.
let repDir: string;
beforeEach(async () => { repDir = await mkdtemp(join(tmpdir(), "praeco-run-rep-")); process.env.REPUTATION_FILE = join(repDir, "reputation.json"); });
afterEach(async () => { delete process.env.REPUTATION_FILE; await rm(repDir, { recursive: true, force: true }); });

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
    getOrder: vi.fn(async () => ({ status: "created", price: "100000", deliverTxHash: "0xd" })),
    payOrder: vi.fn(async () => ({ txHash: "0xpay" })),
    getDelivery: vi.fn(async () => ({ deliverableType: "text", deliverableText:
      "Privacy-first habit tracker research: indie developers want local-first tools, no mandatory cloud, " +
      "one-time purchase pricing, and calm developer-focused positioning against gamified incumbents like Habitica.",
      contentHash: "0xh" })),
  };
}

const fakeLlm: Llm = {
  completeText: async () => "",
  completeJson: (async (prompt: string) => {
    if (prompt.includes("intake analyst")) return { product: "Streaky", audience: "builders", features: ["streaks"], tone: "playful", oneLiner: "Track habits.", inScope: true, scopeReason: "" };
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
    expect(rec.kit?.ogImageRef).toBe("hash:0xh");
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
        if (prompt.includes("intake analyst")) return { product: "Streaky", audience: "builders", features: ["streaks"], tone: "playful", oneLiner: "Track habits.", inScope: true, scopeReason: "" };
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

  it("persists a QA-accept reputation outcome for the hired agent after a run", async () => {
    // Reuses baseDeps() (not a hand-rolled deps object) so the hire's negotiation/delivery
    // polls resolve instantly via its scripted hirePollOpts — the same convention every
    // other test in this file relies on to avoid real setTimeout-based poll delays.
    await runLaunchJob({ text: "a habit tracker" }, { ...baseDeps(), drive: scriptedDriver, now: () => 1 });
    const store = JSON.parse(await readFile(process.env.REPUTATION_FILE!, "utf8"));
    expect(store.a1.accepts).toBe(3); // three legs, all QA-accepted, all hired from agent a1
  });
});

// A mock CAP client whose only-ever-hired provider ("pin-bad") delivers a
// redemption code (no inline content). vi.fn records negotiations so the test
// can prove the inline alternative in the catalog is NEVER paid (fail-closed pin).
function failClosedClient(): CapBuyer {
  let n = 0;
  return {
    negotiateOrder: vi.fn(async (_req: any) => ({ negotiationId: `neg-${++n}` })),
    getNegotiation: vi.fn(async () => ({ status: "pending" })),
    listOrders: vi.fn(async () => [{ orderId: `ord-${n}`, negotiationId: `neg-${n}`, price: "100000", status: "created" }]),
    getOrder: vi.fn(async (id: string) => ({ status: "created", price: "100000", deliverTxHash: `0xd-${id}` })),
    payOrder: vi.fn(async () => ({ txHash: "0xpay" })),
    getDelivery: vi.fn(async () => ({ deliverableType: "text", deliverableText: "Your report is ready. Redeem code RSCH-9F2A at https://pygm.studio/r/RSCH-9F2A", contentHash: "0xh" })),
  };
}

// Catalog with the pinned bad provider + an inline research alternative that
// must NEVER be hired (the pin is authoritative + fail-closed).
const failClosedFetch = (async (url: string, init?: RequestInit) => {
  if (init?.method === "POST") return new Response(JSON.stringify({ result: "0x00000000000000000000000000000000000000000000000000000000001e8480" }), { status: 200 });
  const u = String(url);
  const agents: Record<string, unknown> = {
    pygm: { agent: { agentId: "pygm", name: "Pygm", completedOrders: "1401", completionRate: 100, onlineStatus: "online", skillTagSlugs: ["content-creative"], services: [{ serviceId: "pin-bad", name: "Research Redemption Code", price: "100000", requirementType: "text", requirementSchema: "[]", deliverableType: "text" }] } },
    zeru: { agent: { agentId: "zeru", name: "ZERU", completedOrders: "500", completionRate: 100, onlineStatus: "online", skillTagSlugs: ["research-report"], services: [{ serviceId: "inline-good", name: "Verifiable Research Report", price: "100000", requirementType: "text", requirementSchema: "[]", deliverableType: "text" }] } },
  };
  const m = u.match(/\/public\/agents\/([^/?]+)/);
  if (m) return new Response(JSON.stringify(agents[m[1]] ?? {}), { status: 200 });
  if (u.includes("/public/agents")) return new Response(JSON.stringify({ agents: [
    { agentId: "pygm", name: "Pygm", completedOrders: "1401", completionRate: 100, onlineStatus: "online", skillTagSlugs: ["content-creative"] },
    { agentId: "zeru", name: "ZERU", completedOrders: "500", completionRate: 100, onlineStatus: "online", skillTagSlugs: ["research-report"] },
  ], total: "2" }), { status: 200 });
  if (u.includes("/public/services")) return new Response(JSON.stringify(u.includes("page=1") ? { items: [
    { serviceId: "pin-bad", agentId: "pygm", name: "Research Redemption Code", description: "research report", price: "100000", orders7d: "50" },
    { serviceId: "inline-good", agentId: "zeru", name: "Verifiable Research Report", description: "market intelligence report", price: "100000", orders7d: "9" },
  ], total: "2" } : { items: [], total: "2" }), { status: 200 });
  return new Response("not found", { status: 404 });
}) as unknown as typeof fetch;

describe("runLaunchJob — §7 cap-only fail-closed on a bad pin", () => {
  it("bounds spend to the cap and never pays an unvetted provider when a pinned provider keeps failing QA", async () => {
    const client = failClosedClient();
    // Faithful agent-loop stand-in: gate every hire through beforeToolCall, like the real loop.
    const capDriver: EngineDriver = async (ctx: RunContext) => {
      const tools = Object.fromEntries(buildTools(ctx).map((t) => [t.name, t]));
      const guard = makeBeforeToolCall(ctx);
      for (let i = 0; i < 3; i++) {
        // Pin is authoritative + fail-closed: discovery only ever returns "pin-bad".
        await tools.search_marketplace.execute("x", { leg: "research", query: "research" });
        const blocked = await guard({ toolCall: { name: "hire_specialist" }, args: { leg: "research", serviceId: "pin-bad" } } as any);
        if (blocked?.block) break; // cap reached — stop hiring (graceful, no unvetted spend)
        const h = await tools.hire_specialist.execute("x", { leg: "research", serviceId: "pin-bad", requirements: { topic: "habits" } });
        await tools.qa_review.execute("x", { orderId: (h.details as any).orderId }); // formatGate -> swap (pin stays fail-closed)
      }
      return {};
    };

    const rec = await runLaunchJob(
      { text: "Streaky habit tracker" },
      {
        ...baseDeps(),
        client,
        fetchImpl: failClosedFetch,
        config: { ...config, preferredServiceIds: { research: "pin-bad" } },
        drive: capDriver,
      },
    );

    // The cap bounds paid attempts to 2 — spend cannot exceed 2×price.
    expect(client.payOrder).toHaveBeenCalledTimes(2);
    expect(rec.spentBaseUnits).toBe("200000");
    // Fail-closed: every negotiation was for the pinned provider — the inline
    // alternative that EXISTS in the catalog is never paid.
    const negotiated = (client.negotiateOrder as any).mock.calls.map((c: any[]) => c[0].serviceId);
    expect(negotiated.every((s: string) => s === "pin-bad")).toBe(true);
    // No leg succeeded → graceful abort (no kit, no asset from an unvetted provider).
    expect(rec.status).toBe("aborted");
    expect(rec.assets).toHaveLength(0);
  });
});
