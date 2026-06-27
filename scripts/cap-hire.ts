/**
 * Phase-0 Task 6 — CAP end-to-end hire smoke (PROVEN working 2026-06-27).
 *
 * Praeco discovers → negotiates → pays USDC on Base → receives a delivery.
 * Validated run: order 20917ea8…, payTx 0x434759…, deliverTx 0x33d1ce…, cleared.
 * Cost ≈ $0.11 ($0.10 service + ~$0.01 gas) from Praeco's AGENT wallet.
 *
 * TWO NON-OBVIOUS GATES (see docs/superpowers/specs/2026-06-27-phase0-findings.md):
 *   1. Praeco's AGENT wallet (CAP `walletAddress` 0xee47…, NOT the account main
 *      wallet) must hold USDC — a provider will not accept a hire from a $0
 *      requester, and the negotiation hangs `pending` with no rejection.
 *   2. `requirements` must satisfy the service's `requirementSchema`, found at
 *      GET /public/agents/{agentId} → .services[].requirementSchema.
 *
 * RECTOR-AUTHORIZED LIVE SPEND. Run deliberately with `pnpm smoke:hire`.
 * Override target/payload via SMOKE_SERVICE / SMOKE_REQS env vars.
 */
import "dotenv/config";
import { AgentClient } from "@croo-network/sdk";

function req(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

const serviceId = process.env.SMOKE_SERVICE ?? req("SVC_SEO");
// Valid OpsPilot seo_rules_audit payload (all five fields required by its schema).
const requirements =
  process.env.SMOKE_REQS ??
  JSON.stringify({
    title: "Acme Widgets — Premium Handcrafted Widgets & Free Shipping",
    description:
      "Shop premium handcrafted widgets at Acme. Free shipping over $50, 30-day returns, trusted by 10,000+ happy customers worldwide.",
    h1: "Premium Handcrafted Widgets",
    bodyText:
      "Acme crafts premium widgets from sustainably sourced materials. Browse 200+ widget styles, each backed by a lifetime warranty and a 30-day money-back guarantee.",
    hasHttps: true,
  });

const client = new AgentClient(
  { baseURL: req("CROO_API_URL"), wsURL: req("CROO_WS_URL"), rpcURL: req("BASE_RPC_URL") },
  req("CROO_SDK_KEY"),
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 1. Hold a WebSocket open → agent presence flips "online" (providers will not
//    transact with an offline requester). We poll REST for state rather than
//    react to WS events, because the WS replays historical events on connect.
await client.connectWebSocket();
console.log("[ws] online");

// 2. Negotiate.
const neg = await client.negotiateOrder({ serviceId, requirements });
console.log("[negotiation]", neg.negotiationId, "for service", serviceId);

// 3. Poll until the provider accepts and the order is created (or rejects).
let order:
  | { orderId: string; negotiationId: string; price: string; status: string }
  | undefined;
for (let i = 0; i < 40 && !order; i++) {
  await sleep(1500);
  const n = await client.getNegotiation(neg.negotiationId);
  if (n.status === "rejected") {
    console.error("[negotiation] REJECTED:", n.rejectReason);
    process.exit(1);
  }
  const orders = await client.listOrders({ role: "buyer", page: 1, pageSize: 20 });
  order = orders.find((o) => o.negotiationId === neg.negotiationId);
}
if (!order) {
  console.error("[timeout] no order created in 60s — is Praeco's AGENT wallet funded? (gate #1)");
  process.exit(1);
}
console.log(`[order] created: ${order.orderId} ($${Number(order.price) / 1e6}) → paying…`);

// 4. Pay — LIVE USDC settlement on Base.
const pay = await client.payOrder(order.orderId);
console.log("[order] PAID tx:", pay.txHash);
console.log("[receipt] https://basescan.org/tx/" + pay.txHash);

// 5. Wait for the provider to deliver.
for (let i = 0; i < 60; i++) {
  await sleep(3000);
  const o = await client.getOrder(order.orderId);
  if (o.deliverTxHash || o.status === "completed") {
    const d = await client.getDelivery(order.orderId);
    console.log("[delivery]", (d.deliverableText || d.deliverableSchema || JSON.stringify(d)).slice(0, 800));
    console.log("[contentHash]", d.contentHash);
    console.log("[deliverTx] https://basescan.org/tx/" + o.deliverTxHash);
    process.exit(0);
  }
}
console.log("[delivery] not received within 180s — fetch later with getDelivery(orderId)");
process.exit(0);
