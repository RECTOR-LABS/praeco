import { describe, it, expect } from "vitest";
import { mockFetch, mockClient } from "./mock.js";

describe("mock marketplace", () => {
  it("serves the services catalog page 1", async () => {
    const f = mockFetch();
    const res = await f("https://x/public/services?page=1" as any);
    const body = await res.json();
    expect(body.items.map((s: any) => s.serviceId)).toEqual(["mock-research", "mock-copy", "mock-image"]);
  });
  it("delivers keyed content per serviceId via negotiate→getDelivery", async () => {
    const c = mockClient();
    await c.negotiateOrder({ serviceId: "mock-copy" } as any);
    const [order] = await c.listOrders({} as any);
    const d = await c.getDelivery(order.orderId);
    expect(d.deliverableText).toContain("Headline: Streaky");
    expect(d.contentHash).toMatch(/^0xmockhash/);
  });
});
