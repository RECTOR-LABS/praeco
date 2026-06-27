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
  it("non-numeric price doesn't crash ranking and unparseable price ranks last", () => {
    const a = mk({ serviceId: "finite", priceBaseUnits: "200000" });
    const b = mk({ serviceId: "bad-price", priceBaseUnits: "abc" });
    const result = rankCandidates([b, a]);
    expect(result).toHaveLength(2);
    // finite-priced candidate must rank before the unparseable one
    expect(result[0].serviceId).toBe("finite");
  });
});

describe("searchServices — non-ok response", () => {
  it("getJson throws with URL+status on non-ok", async () => {
    const f = jsonFetch({});
    await expect(searchServices("https://api.croo.network", "seo", f)).rejects.toThrow("CAP public GET");
  });
});

describe("resolveCandidate — missing service", () => {
  it("throws when service is missing from agent", async () => {
    const f = jsonFetch({
      "/public/agents/a1": {
        agentId: "a1",
        name: "n",
        completedOrders: 0,
        completionRate: 0,
        services: [],
      },
    });
    await expect(resolveCandidate("https://api.croo.network", "missing", "a1", f)).rejects.toThrow(/not found on agent/);
  });
});
