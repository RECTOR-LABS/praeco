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
