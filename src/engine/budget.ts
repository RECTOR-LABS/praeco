/**
 * Hard money invariant for a run. Two caps: a per-leg cap (a single hire's
 * price) and a run total (cumulative spend). The agent loop's beforeToolCall
 * guard consults this before any hire; commit() is called once a hire is
 * authorized. All amounts are USDC base units (bigint).
 */
export class BudgetGuard {
  private committed = 0n;

  constructor(
    private readonly totalBaseUnits: bigint,
    private readonly legCapBaseUnits: bigint,
  ) {}

  get spent(): bigint {
    return this.committed;
  }

  remaining(): bigint {
    return this.totalBaseUnits - this.committed;
  }

  legCap(): bigint {
    return this.legCapBaseUnits;
  }

  exceedsLegCap(amount: bigint): boolean {
    return amount > this.legCapBaseUnits;
  }

  canAfford(amount: bigint): boolean {
    return !this.exceedsLegCap(amount) && this.committed + amount <= this.totalBaseUnits;
  }

  commit(amount: bigint): void {
    if (this.exceedsLegCap(amount)) {
      throw new Error(`hire amount ${amount} exceeds per-leg cap ${this.legCapBaseUnits}`);
    }
    if (this.committed + amount > this.totalBaseUnits) {
      throw new Error(`hire amount ${amount} exceeds remaining run budget ${this.remaining()}`);
    }
    this.committed += amount;
  }
}
