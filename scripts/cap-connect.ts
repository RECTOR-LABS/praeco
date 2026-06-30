/**
 * Phase-0 Task 4 — CAP connect smoke.
 * Verifies the SDK key authenticates, the WebSocket opens, and orders list.
 * Reads only the CROO vars it needs (the full loadConfig() also wants LLM vars,
 * which aren't required to validate CAP connectivity).
 */
import "dotenv/config";
import { AgentClient } from "@croo-network/sdk";

function req(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

const client = new AgentClient(
  {
    baseURL: req("CROO_API_URL"),
    wsURL: req("CROO_WS_URL"),
    rpcURL: req("BASE_RPC_URL"),
  },
  req("CROO_SDK_KEY"),
);

try {
  const orders = await client.listOrders({ role: "buyer", page: 1, pageSize: 10 });
  console.log("[orders] ok:", JSON.stringify(orders).slice(0, 300));
} catch (e) {
  console.error("[orders] error:", e);
}

try {
  const stream = await client.connectWebSocket();
  console.log("[ws] connected:", !!stream);
  (stream as { on?: (ev: string, cb: (e: unknown) => void) => void }).on?.(
    "error",
    (e) => console.error("[ws] error:", e),
  );
} catch (e) {
  console.error("[ws] error:", e);
}

setTimeout(() => process.exit(0), 3000);
