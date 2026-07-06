import { extractListing, formatProof, SETTLED, PRAECO_SERVICE_ID } from "./verify-doorb";
import type { AgentRecord } from "../src/cap/discovery.js";

const agent = {
  agentId: "agent-praeco",
  name: "Praeco",
  completedOrders: 1,
  completionRate: 1,
  onlineStatus: "online",
  services: [
    { serviceId: PRAECO_SERVICE_ID, title: "Product Launch Kit", price: "2000000" },
  ],
} as unknown as AgentRecord;

test("extractListing pulls the live listing fields and formats USDC", () => {
  const l = extractListing(agent, PRAECO_SERVICE_ID);
  expect(l).toEqual({
    agentName: "Praeco",
    serviceId: PRAECO_SERVICE_ID,
    title: "Product Launch Kit",
    priceUsd: "2.00",
  });
});

test("extractListing throws with a clear message when the listing is absent", () => {
  const empty = { ...agent, services: [] } as unknown as AgentRecord;
  expect(() => extractListing(empty, PRAECO_SERVICE_ID)).toThrow(/not found on the public CROO API/);
});

test("formatProof surfaces the live listing + the real on-chain settlement facts", () => {
  const out = formatProof(
    { agentName: "Praeco", serviceId: PRAECO_SERVICE_ID, title: "Product Launch Kit", priceUsd: "2.00" },
    SETTLED,
  ).join("\n");
  expect(out).toContain("Product Launch Kit");
  expect(out).toContain(PRAECO_SERVICE_ID);
  expect(out).toContain("$2.00");
  expect(out).toContain(SETTLED.deliverTx);
  expect(out).toContain(SETTLED.contentHash);
  expect(out).toContain(SETTLED.basescan);
});

test("formatProof adds the on-chain confirmation line when a receipt is supplied", () => {
  const out = formatProof(
    { agentName: "Praeco", serviceId: PRAECO_SERVICE_ID, title: "Product Launch Kit", priceUsd: "2.00" },
    SETTLED,
    { block: 48178130, ok: true },
  ).join("\n");
  expect(out).toContain("48178130");
  expect(out).toMatch(/confirmed .*Base mainnet/i);
});
