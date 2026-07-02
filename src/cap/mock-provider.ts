import type { CapProvider, DeliverReq, InboundNegotiation } from "./provider.js";

export function mockProvider(opts: { brief?: string; paysAfter?: number } = {}): CapProvider & { delivered: DeliverReq[] } {
  const brief = opts.brief ?? "A privacy-first habit tracker for indie developers";
  const paysAfter = opts.paysAfter ?? 0;
  const delivered: DeliverReq[] = [];
  let polls = 0;
  let listed = false;
  return {
    delivered,
    async listInboundNegotiations(): Promise<InboundNegotiation[]> {
      if (listed) return []; // one-shot: disappears after it's picked up
      return [{ negotiationId: "mock-neg", status: "pending", requirements: JSON.stringify({ brief }) }];
    },
    async acceptNegotiation() { listed = true; return { orderId: "mock-order" }; },
    async rejectNegotiation() { listed = true; },
    async getOrder() { const status = polls++ < paysAfter ? "creating" : "paid"; return { status, price: "2000000" }; },
    async deliverOrder(_orderId: string, req: DeliverReq) { delivered.push(req); return { contentHash: `0xmockdeliverhash${delivered.length}` }; },
    async rejectOrder() {},
  };
}
