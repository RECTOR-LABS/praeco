import { describe, it, expect } from "vitest";
import { BudgetGuard } from "./budget.js";

describe("BudgetGuard", () => {
  it("affords within the per-leg cap and the run total", () => {
    const g = new BudgetGuard(2_000_000n, 600_000n);
    expect(g.canAfford(100_000n)).toBe(true);
    expect(g.canAfford(700_000n)).toBe(false); // over leg cap
  });

  it("accumulates committed spend and reports remaining", () => {
    const g = new BudgetGuard(2_000_000n, 600_000n);
    g.commit(100_000n);
    g.commit(500_000n);
    expect(g.spent).toBe(600_000n);
    expect(g.remaining()).toBe(1_400_000n);
  });

  it("throws naming the leg cap when a single amount is too large", () => {
    const g = new BudgetGuard(2_000_000n, 600_000n);
    expect(() => g.commit(700_000n)).toThrow(/per-leg cap/);
  });

  it("throws when cumulative spend would exceed the run budget", () => {
    const g = new BudgetGuard(1_000_000n, 600_000n);
    g.commit(600_000n);
    expect(() => g.commit(500_000n)).toThrow(/run budget/);
    expect(g.spent).toBe(600_000n); // unchanged after the rejected commit
  });

  it("canAfford respects the remaining run total, not just the leg cap", () => {
    const g = new BudgetGuard(500_000n, 600_000n);
    g.commit(400_000n);
    expect(g.canAfford(100_000n)).toBe(true);  // 400k+100k = 500k == total, under leg cap
    expect(g.canAfford(200_000n)).toBe(false); // under leg cap (600k) but 400k+200k = 600k > 500k total
  });
});
