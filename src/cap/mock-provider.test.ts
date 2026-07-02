import { describe, it, expect } from "vitest";
import { mockProvider } from "./mock-provider.js";

describe("mockProvider", () => {
  it("exposes one pending negotiation with the given brief", async () => {
    const p = mockProvider({ brief: "a habit tracker" });
    const ns = await p.listInboundNegotiations();
    expect(ns).toHaveLength(1);
    expect(JSON.parse(ns[0].requirements)).toEqual({ brief: "a habit tracker" });
  });
  it("accept returns an orderId; order pays after N polls", async () => {
    const p = mockProvider({ paysAfter: 2 });
    const { orderId } = await p.acceptNegotiation("mock-neg");
    expect((await p.getOrder(orderId)).status).toBe("creating");
    expect((await p.getOrder(orderId)).status).toBe("creating");
    expect((await p.getOrder(orderId)).status).toBe("paid");
  });
  it("records deliveries and returns a contentHash", async () => {
    const p = mockProvider();
    const r = await p.deliverOrder("mock-order", { deliverableType: "text", deliverableText: "kit" });
    expect(r.contentHash).toMatch(/^0x/);
    expect(p.delivered[0].deliverableText).toBe("kit");
  });
});
