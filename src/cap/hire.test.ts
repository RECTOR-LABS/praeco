import { describe, it, expect, vi } from "vitest";
import { hireSpecialist, type CapBuyer } from "./hire.js";

const noSleep = async () => {};
const fast = { negotiationPolls: 3, deliveryPolls: 3, sleep: noSleep };
const base = {
  leg: "research" as const, serviceId: "s1", agentId: "a1", agentName: "OpsPilot",
  requirements: { title: "X" }, priceCapBaseUnits: 200_000n,
};

function happyClient(): CapBuyer {
  return {
    negotiateOrder: vi.fn(async () => ({ negotiationId: "n1" })),
    getNegotiation: vi.fn(async () => ({ status: "pending" })),
    listOrders: vi.fn(async () => [{ orderId: "o1", negotiationId: "n1", price: "100000", status: "created" }]),
    getOrder: vi.fn(async () => ({ status: "completed", deliverTxHash: "0xdeliver" })),
    payOrder: vi.fn(async () => ({ txHash: "0xpay" })),
    getDelivery: vi.fn(async () => ({ deliverableType: "schema", deliverableSchema: '{"total_score":48}', contentHash: "0xhash" })),
  };
}

describe("hireSpecialist (happy path)", () => {
  it("negotiates, pays once, and returns the delivered result with provenance", async () => {
    const client = happyClient();
    const events: string[] = [];
    const res = await hireSpecialist(client, base, (e) => events.push(e.kind), fast);
    expect(client.payOrder).toHaveBeenCalledTimes(1);
    expect(res.orderId).toBe("o1");
    expect(res.payTxHash).toBe("0xpay");
    expect(res.basescanPayUrl).toContain("0xpay");
    expect((res.deliverable.schema as any).total_score).toBe(48);
    expect(events).toEqual(["hire_negotiating", "hire_order_created", "hire_paid", "hire_delivered"]);
  });
});

describe("hireSpecialist (guards)", () => {
  it("never pays when the negotiation is rejected", async () => {
    const client = happyClient();
    client.getNegotiation = vi.fn(async () => ({ status: "rejected", rejectReason: "busy" }));
    await expect(hireSpecialist(client, base, () => {}, fast)).rejects.toThrow(/busy/);
    expect(client.payOrder).not.toHaveBeenCalled();
  });

  it("never pays when no order is created in the poll window (empty-wallet hang)", async () => {
    const client = happyClient();
    client.listOrders = vi.fn(async () => []);
    await expect(hireSpecialist(client, base, () => {}, fast)).rejects.toThrow(/no order created/i);
    expect(client.payOrder).not.toHaveBeenCalled();
  });

  it("never pays when the quoted price exceeds the per-leg cap", async () => {
    const client = happyClient();
    client.listOrders = vi.fn(async () => [{ orderId: "o1", negotiationId: "n1", price: "5000000", status: "created" }]);
    await expect(hireSpecialist(client, { ...base, priceCapBaseUnits: 200_000n }, () => {}, fast)).rejects.toThrow(/exceeds.*cap/i);
    expect(client.payOrder).not.toHaveBeenCalled();
  });

  it("runs assertPayable before paying and aborts (no pay) if it throws", async () => {
    const client = happyClient();
    const assertPayable = vi.fn(async () => { throw new Error("insufficient budget"); });
    await expect(hireSpecialist(client, { ...base, assertPayable }, () => {}, fast)).rejects.toThrow(/insufficient budget/);
    expect(assertPayable).toHaveBeenCalledOnce();
    expect(client.payOrder).not.toHaveBeenCalled();
  });

  it("never pays when order price is malformed (non-integer string)", async () => {
    const client = happyClient();
    client.listOrders = vi.fn(async () => [{ orderId: "o1", negotiationId: "n1", price: "1.5", status: "created" }]);
    await expect(hireSpecialist(client, base, () => {}, fast)).rejects.toThrow(/invalid price/);
    expect(client.payOrder).not.toHaveBeenCalled();
  });

  it("never pays when negotiation ends in unexpected terminal status", async () => {
    const client = happyClient();
    client.getNegotiation = vi.fn(async () => ({ status: "expired" }));
    await expect(hireSpecialist(client, base, () => {}, fast)).rejects.toThrow(/unexpected status|expired/i);
    expect(client.payOrder).not.toHaveBeenCalled();
  });

  it("calls listOrders with pageSize 100", async () => {
    const client = happyClient();
    await hireSpecialist(client, base, () => {}, fast);
    expect(client.listOrders).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 100 }));
  });

  it("calls onPaid once at pay-time even when delivery times out, then throws", async () => {
    const client = happyClient();
    // getOrder never returns a deliverTxHash or completed status — simulates a stalled delivery.
    client.getOrder = vi.fn(async () => ({ status: "pending" }));
    const onPaid = vi.fn();
    await expect(
      hireSpecialist(client, { ...base, onPaid }, () => {}, fast),
    ).rejects.toThrow(/did not deliver/);
    // Payment was made — onPaid must have fired exactly once with the price and orderId.
    expect(onPaid).toHaveBeenCalledOnce();
    expect(onPaid).toHaveBeenCalledWith(100_000n, "o1");
    // payOrder was called exactly once (single-pay invariant preserved).
    expect(client.payOrder).toHaveBeenCalledOnce();
  });
});
