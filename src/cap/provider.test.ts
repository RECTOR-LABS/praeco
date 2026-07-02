import { describe, it, expect, vi } from "vitest";
import { AgentClientProvider } from "./provider.js";

const client = {
  listNegotiations: vi.fn(async () => [{ negotiationId: "n1", status: "pending", requirements: '{"brief":"x"}', requireFundTransfer: false }]),
  acceptNegotiation: vi.fn(async () => ({ order: { orderId: "o1" } })),
  acceptNegotiationWithFundAddress: vi.fn(async () => ({ order: { orderId: "o2" } })),
  rejectNegotiation: vi.fn(async () => {}),
  getOrder: vi.fn(async () => ({ status: "paid", price: "2000000" })),
  deliverOrder: vi.fn(async () => ({ delivery: { contentHash: "0xhash" } })),
  rejectOrder: vi.fn(async () => {}),
};

describe("AgentClientProvider", () => {
  it("lists inbound provider negotiations (role=provider, status=pending)", async () => {
    const p = new AgentClientProvider(client as never);
    const out = await p.listInboundNegotiations();
    expect(client.listNegotiations).toHaveBeenCalledWith({ role: "provider", status: "pending" });
    expect(out[0]).toEqual({ negotiationId: "n1", status: "pending", requirements: '{"brief":"x"}', requireFundTransfer: false });
  });
  it("accepts a negotiation and returns the orderId", async () => {
    const p = new AgentClientProvider(client as never);
    expect(await p.acceptNegotiation("n1")).toEqual({ orderId: "o1" });
    expect(client.acceptNegotiation).toHaveBeenCalledWith("n1");
  });
  it("uses the fund-address accept when a provider fund address is given", async () => {
    const p = new AgentClientProvider(client as never);
    expect(await p.acceptNegotiation("n1", "0xfund")).toEqual({ orderId: "o2" });
    expect(client.acceptNegotiationWithFundAddress).toHaveBeenCalledWith("n1", "0xfund");
  });
  it("delivers and returns the backend contentHash", async () => {
    const p = new AgentClientProvider(client as never);
    const r = await p.deliverOrder("o1", { deliverableType: "text", deliverableText: "kit" });
    expect(client.deliverOrder).toHaveBeenCalledWith("o1", { deliverableType: "text", deliverableText: "kit" });
    expect(r).toEqual({ contentHash: "0xhash" });
  });
});
