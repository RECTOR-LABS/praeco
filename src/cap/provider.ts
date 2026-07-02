// Seller-side CAP surface, narrow + mockable (mirrors CapBuyer). Wraps the SDK
// AgentClient's provider methods. Field access is validated by the Phase-2 mainnet
// spike; the core logic is tested against the mock, not the live SDK.
export interface InboundNegotiation { negotiationId: string; status: string; requirements: string; requireFundTransfer?: boolean }
export interface DeliverReq { deliverableType: string; deliverableText?: string; deliverableSchema?: string }
export interface CapProvider {
  listInboundNegotiations(): Promise<InboundNegotiation[]>;
  acceptNegotiation(negotiationId: string, providerFundAddress?: string): Promise<{ orderId: string }>;
  rejectNegotiation(negotiationId: string, reason: string): Promise<void>;
  getOrder(orderId: string): Promise<{ status: string; price?: string }>;
  deliverOrder(orderId: string, req: DeliverReq): Promise<{ contentHash: string }>;
  rejectOrder(orderId: string, reason: string): Promise<void>;
}

// Minimal shape of the SDK client we depend on (avoids importing SDK types here).
interface SdkClient {
  listNegotiations(opts: { role: string; status?: string }): Promise<Array<{ negotiationId: string; status: string; requirements?: string; requireFundTransfer?: boolean }>>;
  acceptNegotiation(id: string): Promise<{ order: { orderId: string } }>;
  acceptNegotiationWithFundAddress(id: string, addr: string): Promise<{ order: { orderId: string } }>;
  rejectNegotiation(id: string, reason: string): Promise<void>;
  getOrder(id: string): Promise<{ status: string; price?: string }>;
  deliverOrder(id: string, req: DeliverReq): Promise<{ delivery: { contentHash: string } }>;
  rejectOrder(id: string, reason: string): Promise<void>;
}

export class AgentClientProvider implements CapProvider {
  constructor(private readonly client: SdkClient) {}
  async listInboundNegotiations(): Promise<InboundNegotiation[]> {
    const ns = await this.client.listNegotiations({ role: "provider", status: "pending" });
    return ns.map((n) => ({ negotiationId: n.negotiationId, status: n.status, requirements: n.requirements ?? "", requireFundTransfer: n.requireFundTransfer }));
  }
  async acceptNegotiation(negotiationId: string, providerFundAddress?: string): Promise<{ orderId: string }> {
    const res = providerFundAddress
      ? await this.client.acceptNegotiationWithFundAddress(negotiationId, providerFundAddress)
      : await this.client.acceptNegotiation(negotiationId);
    return { orderId: res.order.orderId };
  }
  rejectNegotiation(negotiationId: string, reason: string) { return this.client.rejectNegotiation(negotiationId, reason); }
  getOrder(orderId: string) { return this.client.getOrder(orderId); }
  async deliverOrder(orderId: string, req: DeliverReq): Promise<{ contentHash: string }> {
    const res = await this.client.deliverOrder(orderId, req);
    return { contentHash: res.delivery.contentHash };
  }
  rejectOrder(orderId: string, reason: string) { return this.client.rejectOrder(orderId, reason); }
}
