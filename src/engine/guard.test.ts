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
  return Object.assign(
    {
      budget: new BudgetGuard(2_000_000n, 600_000n), worklog: new Worklog(),
      candidates: new Map([["s1", cand("100000")]]), assets: new Map(),
      requiredLegs: ["research"], pendingHires: new Map(), verdicts: new Map(), paidOrderIds: new Set(),
    },
    over,
  ) as RunContext;
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
