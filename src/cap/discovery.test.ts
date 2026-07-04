import { describe, it, expect } from "vitest";
import {
  listServices, listAgents, getAgent, resolveCandidate, discoverForLeg,
  normalizeRate, parseRequirementSchema, legRelevance,
  type ServiceListing, type AgentRecord,
} from "./discovery.js";

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

// --- Real live-shape fixtures (captured 2026-06-28) ---
const PYGM_AGENT = {
  agent: {
    agentId: "449c3ab5",
    name: "Pygmalion - AI KOL Agent & Studio",
    description: "AI KOL agent and content studio",
    completedOrders: "1401",         // string
    completionRate: 100,             // percent, not fraction
    avgDeliveryText: "< 1min",
    onlineStatus: "online",
    skillTagSlugs: ["content-creative"],
    services: [
      { serviceId: "pygm-text", name: "Pygm Studio Text Code", price: "200000", requirementType: "text", requirementSchema: "[]", requirementText: "", deliverableType: "text" },
      { serviceId: "pygm-image", name: "Pygm Studio Image Code", price: "500000", requirementType: "text", requirementSchema: "[]", requirementText: "", deliverableType: "text" },
    ],
  },
};
const OPS_AGENT = {
  agent: {
    agentId: "13506a9a",
    name: "OpsPilot",
    completedOrders: "3138",
    completionRate: 99.97,
    onlineStatus: "online",
    skillTagSlugs: ["data-analytics"],
    services: [
      {
        serviceId: "ops-seo",
        name: "seo_rules_audit",
        price: "100000",
        requirementType: "schema",
        // requirementSchema arrives JSON-ENCODED, with extra fields the engine ignores
        requirementSchema: JSON.stringify([
          { name: "title", type: "string", required: true, description: "", stringSubtype: "plain" },
          { name: "bodyText", type: "string", required: true, description: "" },
        ]),
        deliverableType: "schema",
      },
    ],
  },
};

describe("normalizeRate", () => {
  it("treats >1 as a percent and passes fractions through", () => {
    expect(normalizeRate(100)).toBeCloseTo(1);
    expect(normalizeRate(99.97)).toBeCloseTo(0.9997);
    expect(normalizeRate(0.98)).toBeCloseTo(0.98);
    expect(normalizeRate(0)).toBe(0);
    expect(normalizeRate(null)).toBe(0);
  });
});

describe("parseRequirementSchema", () => {
  it("parses a JSON-encoded string and strips extra fields", () => {
    const out = parseRequirementSchema('[{"name":"title","type":"string","required":true,"stringSubtype":"plain"}]');
    expect(out).toEqual([{ name: "title", type: "string", required: true }]);
  });
  it("returns [] for empty string, junk, or non-array", () => {
    expect(parseRequirementSchema("[]")).toEqual([]);
    expect(parseRequirementSchema("")).toEqual([]);
    expect(parseRequirementSchema("not json")).toEqual([]);
    expect(parseRequirementSchema({})).toEqual([]);
    expect(parseRequirementSchema(undefined)).toEqual([]);
  });
  it("accepts an already-parsed array", () => {
    expect(parseRequirementSchema([{ name: "brief", type: "string", required: true }]))
      .toEqual([{ name: "brief", type: "string", required: true }]);
  });
});

describe("listServices", () => {
  it("unwraps {items}, maps live fields (name, price, orders7d), and stops at total", async () => {
    const f = jsonFetch({
      "/public/services": (url: string) => url.includes("page=1")
        ? { items: [{ serviceId: "s1", agentId: "a1", name: "Verifiable Research", description: "market intel", price: "100000", orders7d: "30" }], total: "1" }
        : { items: [], total: "1" },
    });
    const out = await listServices("https://api.croo.network", f);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ serviceId: "s1", agentId: "a1", name: "Verifiable Research", priceBaseUnits: "100000", orders7d: 30 });
  });

  it("paginates until fewer than a full page is returned", async () => {
    const page1 = { items: Array.from({ length: 50 }, (_, i) => ({ serviceId: `p1-${i}`, agentId: "a", name: "x", price: "1" })), total: "60" };
    const page2 = { items: Array.from({ length: 10 }, (_, i) => ({ serviceId: `p2-${i}`, agentId: "a", name: "x", price: "1" })), total: "60" };
    const f = jsonFetch({ "/public/services": (url: string) => (url.includes("page=1") ? page1 : page2) });
    const out = await listServices("https://api.croo.network", f);
    expect(out).toHaveLength(60);
  });
});

describe("listAgents", () => {
  it("unwraps {agents}, normalizes percent rate + string orders, keeps skill tags", async () => {
    const f = jsonFetch({
      "/public/agents": { agents: [{ agentId: "449c3ab5", name: "Pygm", completedOrders: "1401", completionRate: 100, onlineStatus: "online", skillTagSlugs: ["content-creative"] }], total: "1" },
    });
    const out = await listAgents("https://api.croo.network", f);
    expect(out[0].completedOrders).toBe(1401);
    expect(out[0].completionRate).toBeCloseTo(1);
    expect(out[0].skillTagSlugs).toEqual(["content-creative"]);
  });
});

describe("getAgent", () => {
  it("unwraps {agent}, normalizes rate, maps service name->title, parses JSON-string schema", async () => {
    const f = jsonFetch({ "/public/agents/13506a9a": OPS_AGENT });
    const a = await getAgent("https://api.croo.network", "13506a9a", f);
    expect(a.name).toBe("OpsPilot");
    expect(a.completionRate).toBeCloseTo(0.9997);
    expect(a.completedOrders).toBe(3138);
    expect(a.services[0].title).toBe("seo_rules_audit"); // name -> title
    expect(a.services[0].requirementSchema).toEqual([
      { name: "title", type: "string", required: true },
      { name: "bodyText", type: "string", required: true },
    ]);
  });

  it("treats a text-type service (empty schema string) as text", async () => {
    const f = jsonFetch({ "/public/agents/449c3ab5": PYGM_AGENT });
    const a = await getAgent("https://api.croo.network", "449c3ab5", f);
    const img = a.services.find((s) => s.serviceId === "pygm-image")!;
    expect(img.requirementType).toBe("text");
    expect(img.requirementSchema).toEqual([]);
    expect(img.title).toBe("Pygm Studio Image Code");
  });
});

describe("resolveCandidate", () => {
  it("merges a service with its agent reputation + parsed schema (real wrapped shape)", async () => {
    const f = jsonFetch({ "/public/agents/13506a9a": OPS_AGENT });
    const c = await resolveCandidate("https://api.croo.network", "ops-seo", "13506a9a", f);
    expect(c.title).toBe("seo_rules_audit");
    expect(c.priceBaseUnits).toBe("100000");
    expect(c.completionRate).toBeCloseTo(0.9997);
    expect(c.requirementType).toBe("schema");
    expect(c.requirementSchema).toEqual([
      { name: "title", type: "string", required: true },
      { name: "bodyText", type: "string", required: true },
    ]);
  });

  it("throws when the service is missing from the agent record", async () => {
    const f = jsonFetch({ "/public/agents/449c3ab5": PYGM_AGENT });
    await expect(resolveCandidate("https://api.croo.network", "missing", "449c3ab5", f)).rejects.toThrow(/not found on agent/);
  });
});

describe("getJson — non-ok response", () => {
  it("throws with URL+status on non-ok", async () => {
    const f = jsonFetch({});
    await expect(listServices("https://api.croo.network", f)).rejects.toThrow("CAP public GET");
  });
});

describe("legRelevance", () => {
  it("scores by field — service name dominates, tags only support", () => {
    expect(legRelevance("Pygm Studio Image Code", "", [], "og_image", "")).toBeGreaterThan(0);
    expect(legRelevance("Pygm Studio Text Code", "", [], "og_image", "")).toBe(0); // "text code" has no image keyword
    expect(legRelevance("Verifiable Research Report", "", [], "research", "")).toBeGreaterThan(0);
  });
  it("ranks a name match above a tag-only match (prevents cross-leg bleed)", () => {
    const nameMatch = legRelevance("OG Image Generator", "", [], "og_image", "");       // name hit ×3
    const tagOnly = legRelevance("Landing Page", "", ["design"], "og_image", "");        // tag hit ×1
    expect(nameMatch).toBeGreaterThan(tagOnly);
  });
});

describe("discoverForLeg", () => {
  const services: ServiceListing[] = [
    { serviceId: "pygm-text", agentId: "449c3ab5", name: "Pygm Studio Text Code", priceBaseUnits: "200000" },
    { serviceId: "pygm-image", agentId: "449c3ab5", name: "Pygm Studio Image Code", priceBaseUnits: "500000" },
    { serviceId: "ops-seo", agentId: "13506a9a", name: "seo_rules_audit", description: "landing page seo", priceBaseUnits: "100000" },
    { serviceId: "swapgod", agentId: "swap1", name: "SwapGod", description: "swap erc20", priceBaseUnits: "100000" },
  ];
  const agentsById = new Map<string, AgentRecord>([
    ["449c3ab5", { agentId: "449c3ab5", name: "Pygm", completedOrders: 1401, completionRate: 1, skillTagSlugs: ["content-creative"], services: [] }],
    ["13506a9a", { agentId: "13506a9a", name: "OpsPilot", completedOrders: 3138, completionRate: 0.9997, skillTagSlugs: ["data-analytics"], services: [] }],
    ["swap1", { agentId: "swap1", name: "SwapGod", completedOrders: 2000, completionRate: 1, skillTagSlugs: ["defi"], services: [] }],
  ]);

  it("picks the image service for og_image (not the text one) and drops irrelevant services", () => {
    const ranked = discoverForLeg(services, agentsById, "og_image", "og image generation");
    expect(ranked[0].serviceId).toBe("pygm-image");
    expect(ranked.map((r) => r.serviceId)).not.toContain("swapgod"); // SwapGod has no image relevance
  });

  it("treats a pinned preferred service as the SOLE candidate (authoritative operator override)", () => {
    const ranked = discoverForLeg(services, agentsById, "research", "market research", { preferredServiceId: "ops-seo" });
    expect(ranked.map((r) => r.serviceId)).toEqual(["ops-seo"]);
  });

  it("fails CLOSED when the pinned service is not in the catalog (no silent fallback to a different provider)", () => {
    const ranked = discoverForLeg(services, agentsById, "og_image", "og image", { preferredServiceId: "does-not-exist" });
    expect(ranked).toEqual([]); // a pin must never resolve to an unvetted provider
  });

  it("respects the limit", () => {
    const ranked = discoverForLeg(services, agentsById, "landing_copy", "copy", { limit: 1 });
    expect(ranked).toHaveLength(1);
  });
});

describe("getAgent — captures deliverableType", () => {
  it("parses deliverableType from the agent service record", async () => {
    const f = jsonFetch({ "/public/agents/13506a9a": OPS_AGENT });
    const a = await getAgent("https://api.croo.network", "13506a9a", f);
    expect(a.services[0].deliverableType).toBe("schema");
  });
});

describe("discoverForLeg — de-ranks code/redemption services", () => {
  const services: ServiceListing[] = [
    { serviceId: "pygm-image", agentId: "pygm", name: "Pygm Studio Image Code", priceBaseUnits: "500000" },
    { serviceId: "inline-image", agentId: "foundr", name: "OG Image Generator", description: "inline og image", priceBaseUnits: "500000" },
  ];
  const agentsById = new Map<string, AgentRecord>([
    ["pygm", { agentId: "pygm", name: "Pygm", completedOrders: 1401, completionRate: 1, skillTagSlugs: [], services: [] }],
    ["foundr", { agentId: "foundr", name: "Foundr", completedOrders: 500, completionRate: 1, skillTagSlugs: [], services: [] }],
  ]);

  it("ranks the inline image provider above the higher-reputation 'Code' provider", () => {
    const ranked = discoverForLeg(services, agentsById, "og_image", "og image");
    expect(ranked[0].serviceId).toBe("inline-image"); // de-ranked despite lower reputation
    expect(ranked.map((r) => r.serviceId)).toContain("pygm-image"); // still present (de-rank, not exclude)
    expect(ranked.find((r) => r.serviceId === "pygm-image")?.formatDeRank).toBe(1);
    expect(ranked.find((r) => r.serviceId === "inline-image")?.formatDeRank).toBe(0);
  });
});
