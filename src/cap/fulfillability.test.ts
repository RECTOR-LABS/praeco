import { describe, it, expect } from "vitest";
import { assessFulfillability, findStalePins, parseBaseUnits, checkFulfillability } from "./fulfillability.js";
import type { ServiceListing, AgentRecord } from "./discovery.js";
import type { Config } from "../config.js";

/** Fetch stub keyed by URL substring; mirrors the live CAP public REST shapes. */
function jsonFetch(map: Record<string, unknown | ((url: string) => unknown)>): typeof fetch {
  return (async (url: string) => {
    const key = Object.keys(map).find((k) => String(url).includes(k));
    if (key === undefined) return new Response("not found", { status: 404 });
    const v = map[key];
    const body = typeof v === "function" ? (v as (u: string) => unknown)(String(url)) : v;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

const agent = (agentId: string): AgentRecord =>
  ({ agentId, name: agentId, completedOrders: 100, completionRate: 1, skillTagSlugs: [], services: [] });

// A catalog that fully staffs all three legs, each affordably (<= $0.60 cap).
const fullServices: ServiceListing[] = [
  { serviceId: "r1", agentId: "ar", name: "Verifiable Research Report", description: "market research competitive analysis", priceBaseUnits: "100000" },
  { serviceId: "c1", agentId: "ac", name: "Landing Page Copy", description: "landing page copywriting and content", priceBaseUnits: "100000" }, // NB: avoid "marketing" — its "market" substring would score as a research hit
  { serviceId: "i1", agentId: "ai", name: "OG Image Generator", description: "og image social preview design", priceBaseUnits: "500000" },
];
const fullAgents = new Map<string, AgentRecord>([["ar", agent("ar")], ["ac", agent("ac")], ["ai", agent("ai")]]);
const base = { preferredServiceIds: {}, legCapBaseUnits: 600000n, runBudgetBaseUnits: 2000000n };

describe("parseBaseUnits", () => {
  it("parses integer strings, rejects junk/decimals as null", () => {
    expect(parseBaseUnits("100000")).toBe(100000n);
    expect(parseBaseUnits(" 200000 ")).toBe(200000n);
    expect(parseBaseUnits("")).toBeNull();
    expect(parseBaseUnits("abc")).toBeNull();
    expect(parseBaseUnits("1.5")).toBeNull();
  });
});

describe("assessFulfillability", () => {
  it("ok when every leg has an affordable candidate and the kit fits the budget", () => {
    const r = assessFulfillability(fullServices, fullAgents, base);
    expect(r.ok).toBe(true);
    expect(r.perLeg.map((l) => l.affordable)).toEqual([1, 1, 1]);
  });
  it("rejects when a required leg has zero matching candidates", () => {
    const r = assessFulfillability(fullServices.filter((s) => s.serviceId !== "c1"), fullAgents, base);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/landing_copy: no live specialist/);
  });
  it("rejects with a stale-pin reason when a pinned service is absent", () => {
    const r = assessFulfillability(fullServices, fullAgents, { ...base, preferredServiceIds: { research: "gone-123" } });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/research: pinned service gone-123 is offline \(stale pin\)/);
  });
  it("rejects when a leg's only candidate exceeds the leg cap", () => {
    const svcs = fullServices.map((s) => (s.serviceId === "i1" ? { ...s, priceBaseUnits: "700000" } : s));
    const r = assessFulfillability(svcs, fullAgents, base);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/og_image: no candidate priced within the \$0.60 leg cap/);
  });
  it("treats a 0/missing price (discovery's sentinel) as unaffordable, not free", () => {
    const svcs = fullServices.map((s) => (s.serviceId === "i1" ? { ...s, priceBaseUnits: "0" } : s));
    const r = assessFulfillability(svcs, fullAgents, base);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/og_image: no candidate priced within the \$0.60 leg cap/);
  });
  it("does not count an affordable candidate the engine's search limit would truncate", () => {
    // research leg: 5 high-rep candidates over the $0.60 cap + 1 affordable low-rep
    // one that sorts 6th → truncated by SEARCH_CANDIDATE_LIMIT → leg unfulfillable.
    const overCap = Array.from({ length: 5 }, (_, i) => ({ serviceId: `hi${i}`, agentId: `hi${i}`, name: "Market Research Report", description: "competitive analysis", priceBaseUnits: "700000" }));
    const svcs: ServiceListing[] = [
      ...overCap,
      { serviceId: "cheap", agentId: "lo", name: "Market Research Report", description: "competitive analysis", priceBaseUnits: "100000" },
      { serviceId: "c1", agentId: "ac", name: "Landing Page Copy", description: "landing page copywriting and content", priceBaseUnits: "100000" },
      { serviceId: "i1", agentId: "ai", name: "OG Image Generator", description: "og image banner visual design", priceBaseUnits: "500000" },
    ];
    const agents = new Map<string, AgentRecord>([["ac", agent("ac")], ["ai", agent("ai")], ["lo", { agentId: "lo", name: "lo", completedOrders: 1, completionRate: 0.5, skillTagSlugs: [], services: [] }]]);
    for (let i = 0; i < 5; i++) agents.set(`hi${i}`, { agentId: `hi${i}`, name: `hi${i}`, completedOrders: 1000, completionRate: 1, skillTagSlugs: [], services: [] });
    const r = assessFulfillability(svcs, agents, base);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/research: no candidate priced within the \$0.60 leg cap/);
  });
  it("rejects when the cheapest full kit exceeds the run budget", () => {
    const svcs = fullServices.map((s) => ({ ...s, priceBaseUnits: "500000" })); // each $0.50 <= cap
    const r = assessFulfillability(svcs, fullAgents, { ...base, runBudgetBaseUnits: 1000000n }); // $1.00 budget
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/cheapest full kit \$1.50 exceeds the \$1.00 run budget/);
  });
  it("excludes the caller's own agent — a leg served only by self is unfulfillable", () => {
    const r = assessFulfillability(fullServices, fullAgents, { ...base, selfAgentId: "ai" });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/og_image: no live specialist/);
  });
});

describe("findStalePins", () => {
  it("flags pinned ids absent from the catalog, ignores present + unset", () => {
    const stale = findStalePins(fullServices, { research: "r1", landing_copy: "gone" });
    expect(stale).toEqual([{ leg: "landing_copy", serviceId: "gone" }]);
  });
});

describe("checkFulfillability (live wrapper)", () => {
  const servicesPayload = {
    items: [
      { serviceId: "r1", agentId: "ar", name: "Verifiable Research Report", description: "market research competitive analysis", price: "100000" },
      { serviceId: "c1", agentId: "ac", name: "Landing Page Copy", description: "landing page copywriting and content", price: "100000" },
      { serviceId: "i1", agentId: "ai", name: "OG Image Generator", description: "og image banner visual design", price: "500000" },
    ],
    total: "3",
  };
  const agentsPayload = {
    agents: [
      { agentId: "ar", name: "AR", completedOrders: "100", completionRate: 100, onlineStatus: "online", skillTagSlugs: [] },
      { agentId: "ac", name: "AC", completedOrders: "100", completionRate: 100, onlineStatus: "online", skillTagSlugs: [] },
      { agentId: "ai", name: "AI", completedOrders: "100", completionRate: 100, onlineStatus: "online", skillTagSlugs: [] },
    ],
    total: "3",
  };
  const fetchImpl = jsonFetch({
    "/public/services": (url: string) => (url.includes("page=1") ? servicesPayload : { items: [], total: "3" }),
    "/public/agents": agentsPayload,
  });
  const cfg = { crooApiUrl: "https://api.test", preferredServiceIds: {}, praecoAgentId: "nobody", legCapUsdc: "0.60", runBudgetUsdc: "2.00" } as unknown as Config;

  it("fetches both catalogs and reports all three legs fulfillable", async () => {
    const r = await checkFulfillability(cfg, fetchImpl);
    expect(r.ok).toBe(true);
    expect(r.perLeg.map((l) => l.leg)).toEqual(["research", "landing_copy", "og_image"]);
  });
  it("applies the config's self-exclusion (praecoAgentId → excludeAgentId)", async () => {
    const r = await checkFulfillability({ ...cfg, praecoAgentId: "ai" } as unknown as Config, fetchImpl);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/og_image: no live specialist/);
  });
});
