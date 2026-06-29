import type { CapBuyer } from "./hire.js";
import type { FetchFn } from "./wallet.js";

export function mockFetch(): FetchFn {
  const services = {
    items: [
      { serviceId: "mock-research", agentId: "ma1", name: "Verifiable Research", description: "market research and competitive analysis", price: "100000", orders7d: "30" },
      { serviceId: "mock-copy", agentId: "ma2", name: "Landing Page Copy", description: "landing page copywriting and content", price: "100000", orders7d: "80" },
      { serviceId: "mock-image", agentId: "ma3", name: "OG Image", description: "og image generation and visual design", price: "500000", orders7d: "25" },
    ],
    total: "3",
  };
  const agentsCatalog = {
    agents: [
      { agentId: "ma1", name: "ProofResearch", completedOrders: "500", completionRate: 98, onlineStatus: "online", skillTagSlugs: ["research-report"] },
      { agentId: "ma2", name: "Foundr", completedOrders: "500", completionRate: 98, onlineStatus: "online", skillTagSlugs: ["content-creative"] },
      { agentId: "ma3", name: "Pygm Studio", completedOrders: "500", completionRate: 98, onlineStatus: "online", skillTagSlugs: ["content-creative"] },
    ],
    total: "3",
  };
  const svc: Record<string, { serviceId: string; name: string; price: string }> = {
    ma1: { serviceId: "mock-research", name: "Verifiable Research", price: "100000" },
    ma2: { serviceId: "mock-copy", name: "Landing Page Copy", price: "100000" },
    ma3: { serviceId: "mock-image", name: "OG Image", price: "500000" },
  };
  const reqSchema = JSON.stringify([{ name: "brief", type: "string", required: true, description: "", stringSubtype: "plain" }]);
  const agentRecord = (id: string) => {
    const cat = agentsCatalog.agents.find((a) => a.agentId === id);
    const s = svc[id];
    return { agent: { ...cat, services: s ? [{ ...s, requirementType: "schema", requirementSchema: reqSchema, requirementText: "", deliverableType: "text" }] : [] } };
  };
  return (async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return new Response(JSON.stringify({ result: "0x00000000000000000000000000000000000000000000000000000000004c4b40" }), { status: 200 }); // 5 USDC
    const u = String(url);
    const m = u.match(/\/public\/agents\/([^/?]+)/);
    if (m) return new Response(JSON.stringify(agentRecord(m[1])), { status: 200 });
    if (u.includes("/public/agents")) return new Response(JSON.stringify(agentsCatalog), { status: 200 });
    if (u.includes("/public/services")) return new Response(JSON.stringify(u.includes("page=1") ? services : { items: [], total: "3" }), { status: 200 });
    return new Response("not found", { status: 404 });
  }) as unknown as FetchFn;
}

export function mockClient(): CapBuyer {
  let n = 0;
  let lastNeg = "";
  // orderId → serviceId: set at negotiate time so getDelivery is retry-safe
  const orderService: Record<string, string> = {};

  // Keyed by serviceId — each provider always returns the same type of content
  const serviceDeliverables: Record<string, { deliverableType: string; deliverableText: string }> = {
    "mock-research": {
      deliverableType: "text",
      deliverableText:
        "Market research: privacy-first habit trackers resonate with indie developers (25-40). " +
        "Top pains: guilt-driven streak loss, data exfiltration by SaaS vendors, tool sprawl across paid tiers. " +
        "Competitive whitespace: incumbents (Habitica, Streaks) skew gamified and cloud-dependent. " +
        "Positioning opportunity = calm, local-first, no mandatory cloud, developer CLI. " +
        "Willingness to pay: one-time purchase preferred; OSS with optional self-hosted sync resonates strongly.",
    },
    "mock-copy": {
      deliverableType: "text",
      deliverableText:
        "Headline: Streaky — habit tracking, local-first.\n" +
        "Subhead: Privacy-first habit tracker built for indie developers. Your data stays on your machine. " +
        "No account. No cloud dependency. No subscription.\n" +
        "Features: Local SQLite store · AES-256 encrypted export · CLI + lightweight web UI · Zero telemetry · Self-hostable sync.\n" +
        "CTA: Install now — npm install -g streaky — MIT licensed, open source.",
    },
    "mock-image": {
      deliverableType: "text",
      deliverableText:
        "https://images.mock.local/streaky-og-1200x630.png\n" +
        "OG image spec: dark background (#0D1117), 'Streaky' in bold monospace center-left, " +
        "tagline 'Private. Local. Yours.' in muted grey (#6B7280) below, right panel shows a minimal " +
        "streak-calendar grid. 1200×630px optimised for Twitter/LinkedIn preview cards. " +
        "Minimal indie-dev aesthetic — no gradients, no stock imagery.",
    },
  };
  const servicePrices: Record<string, string> = {
    "mock-research": "100000",
    "mock-copy": "100000",
    "mock-image": "500000",
  };

  return {
    negotiateOrder: async (req) => {
      const id = `neg-${++n}`;
      lastNeg = id;
      orderService[`ord-${n}`] = req.serviceId;
      return { negotiationId: id };
    },
    getNegotiation: async () => ({ status: "pending" }),
    listOrders: async () => {
      const orderId = `ord-${n}`;
      const svcId = orderService[orderId] ?? "mock-research";
      return [{ orderId, negotiationId: lastNeg, price: servicePrices[svcId] ?? "100000", status: "created" }];
    },
    getOrder: async (id: string) => ({ status: "created", price: servicePrices[orderService[id] ?? "mock-research"] ?? "100000", deliverTxHash: `0xmockdeliver-${id}` }),
    payOrder: async () => ({ txHash: `0xmockpay${n}` }),
    getDelivery: async (id: string) => {
      const svcId = orderService[id] ?? "mock-research";
      const d = serviceDeliverables[svcId] ?? serviceDeliverables["mock-research"];
      return { ...d, contentHash: `0xmockhash${id}` };
    },
  };
}
