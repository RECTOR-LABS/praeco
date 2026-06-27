/**
 * Phase-0 Task 6 — CAP end-to-end hire smoke (the core de-risk).
 * Hires ONE cheap real service (OpsPilot seo_rules_audit, $0.10) and settles
 * USDC on Base: negotiate -> on OrderCreated -> payOrder (txHash) -> on
 * OrderCompleted -> getDelivery.
 *
 * RECTOR-AUTHORIZED LIVE SPEND. Requires the agent's AA wallet to be funded
 * (Top Up ~$5 USDC). Proves Praeco can discover -> hire -> pay -> receive.
 */
import "dotenv/config";
import { AgentClient, EventType } from "@croo-network/sdk";

function req(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

const serviceId = req("SVC_SEO"); // cheapest leg ($0.10) for the smoke
const client = new AgentClient(
  { baseURL: req("CROO_API_URL"), wsURL: req("CROO_WS_URL"), rpcURL: req("BASE_RPC_URL") },
  req("CROO_SDK_KEY"),
);

type OrderEvent = { order_id?: string };
const stream = (await client.connectWebSocket()) as {
  on: (ev: string, cb: (e: OrderEvent) => void) => void;
};

stream.on(EventType.OrderCreated, async (e: OrderEvent) => {
  console.log("[order] created:", e.order_id, "→ paying…");
  try {
    const pay = await client.payOrder(e.order_id!);
    console.log("[order] PAID tx:", pay.txHash);
    console.log("[receipt] https://basescan.org/tx/" + pay.txHash);
  } catch (err) {
    console.error("[pay] error:", err);
    process.exit(1);
  }
});

stream.on(EventType.OrderCompleted, async (e: OrderEvent) => {
  try {
    const delivery = await client.getDelivery(e.order_id!);
    const text = delivery.deliverableText || JSON.stringify(delivery);
    console.log("[delivery]", text.slice(0, 600));
  } catch (err) {
    console.error("[delivery] error:", err);
  }
  process.exit(0);
});

stream.on(EventType.OrderRejected, (e: OrderEvent) => {
  console.error("[order] REJECTED:", e);
  process.exit(1);
});

const neg = await client.negotiateOrder({
  serviceId,
  requirements: JSON.stringify({ url: "https://example.com" }),
});
console.log("[negotiation]", neg.negotiationId, "for service", serviceId);

setTimeout(() => {
  console.error("[timeout] no completion within 180s");
  process.exit(1);
}, 180_000);
