import { describe, it, expect } from "vitest";
import { assessFulfillability, findStalePins, parseBaseUnits } from "./fulfillability.js";
import type { ServiceListing, AgentRecord } from "./discovery.js";

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
    expect(r.reason).toMatch(/og_image: cheapest candidate exceeds the \$0.60 leg cap/);
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
