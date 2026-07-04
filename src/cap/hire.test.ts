import { describe, it, expect, vi } from "vitest";
import { hireSpecialist, type CapBuyer } from "./hire.js";

const noSleep = async () => {};
const fast = { negotiationPolls: 4, deliveryPolls: 3, sleep: noSleep };
const base = {
  leg: "research" as const, serviceId: "s1", agentId: "a1", agentName: "OpsPilot",
  requirements: { title: "X" }, priceCapBaseUnits: 200_000n,
};

// listOrders surfaces the order (matchable by negotiationId) but WITHOUT a price;
// getOrder carries the real status + price. This mirrors the live CAP shapes.
function happyClient(): CapBuyer {
  return {
    negotiateOrder: vi.fn(async () => ({ negotiationId: "n1" })),
    getNegotiation: vi.fn(async () => ({ status: "accepted" })),
    listOrders: vi.fn(async () => [{ orderId: "o1", negotiationId: "n1", price: "", status: "creating" }]),
    getOrder: vi.fn(async () => ({ status: "created", price: "100000", deliverTxHash: "0xdeliver" })),
    payOrder: vi.fn(async () => ({ txHash: "0xpay" })),
    getDelivery: vi.fn(async () => ({ deliverableType: "schema", deliverableSchema: '{"total_score":48}', contentHash: "0xhash" })),
  };
}

describe("hireSpecialist (happy path)", () => {
  it("negotiates, waits for the order to finalize, pays once, returns the delivered result", async () => {
    const client = happyClient();
    const events: string[] = [];
    const res = await hireSpecialist(client, base, (e) => events.push(e.kind), fast);
    expect(client.payOrder).toHaveBeenCalledTimes(1);
    expect(res.orderId).toBe("o1");
    expect(res.priceBaseUnits).toBe("100000"); // price read from getOrder, not the price-less listOrders
    expect(res.payTxHash).toBe("0xpay");
    expect((res.deliverable.schema as any).total_score).toBe(48);
    expect(events).toEqual(["hire_negotiating", "hire_order_created", "hire_paid", "hire_delivered"]);
  });
});

describe("hireSpecialist (order finalization)", () => {
  it("waits while the order is 'creating', then pays once getOrder reports 'created' + price", async () => {
    const client = happyClient();
    let calls = 0;
    client.getOrder = vi.fn(async () => {
      calls++;
      return calls < 2 ? { status: "creating" } : { status: "created", price: "100000", deliverTxHash: "0xdeliver" };
    });
    const res = await hireSpecialist(client, base, () => {}, fast);
    expect(client.payOrder).toHaveBeenCalledTimes(1);
    expect(res.priceBaseUnits).toBe("100000");
  });

  it("never pays an order stuck in 'creating' (prevents reverting pay + paymaster gas burn)", async () => {
    const client = happyClient();
    client.getOrder = vi.fn(async () => ({ status: "creating" }));
    await expect(hireSpecialist(client, base, () => {}, fast)).rejects.toThrow(/no payable order|creating/i);
    expect(client.payOrder).not.toHaveBeenCalled();
  });

  it("throws FAST (no pay, no full-window poll) when the order ends in a real terminal status", async () => {
    const client = happyClient();
    client.getOrder = vi.fn(async () => ({ status: "create_failed" })); // real @croo-network/sdk OrderStatus
    await expect(hireSpecialist(client, base, () => {}, fast)).rejects.toThrow(/ended in status "create_failed"/);
    expect(client.payOrder).not.toHaveBeenCalled();
    expect(client.getOrder).toHaveBeenCalledTimes(1); // aborts on the first check, not after the whole poll window
  });

  it("also aborts on pay_failed — a real terminal status the old vocabulary missed", async () => {
    const client = happyClient();
    client.getOrder = vi.fn(async () => ({ status: "pay_failed" }));
    await expect(hireSpecialist(client, base, () => {}, fast)).rejects.toThrow(/ended in status "pay_failed"/);
    expect(client.payOrder).not.toHaveBeenCalled();
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
    await expect(hireSpecialist(client, base, () => {}, fast)).rejects.toThrow(/no payable order/i);
    expect(client.payOrder).not.toHaveBeenCalled();
  });

  it("never pays when the quoted price exceeds the per-leg cap", async () => {
    const client = happyClient();
    client.getOrder = vi.fn(async () => ({ status: "created", price: "5000000", deliverTxHash: "0xdeliver" }));
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
    client.getOrder = vi.fn(async () => ({ status: "created", price: "1.5", deliverTxHash: "0xdeliver" }));
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
    // getOrder reports a payable order (finalization passes) but never delivers.
    client.getOrder = vi.fn(async () => ({ status: "created", price: "100000" }));
    const onPaid = vi.fn();
    await expect(
      hireSpecialist(client, { ...base, onPaid }, () => {}, fast),
    ).rejects.toThrow(/did not deliver/);
    expect(onPaid).toHaveBeenCalledOnce();
    expect(onPaid).toHaveBeenCalledWith(100_000n, "o1");
    expect(client.payOrder).toHaveBeenCalledOnce();
  });
});
