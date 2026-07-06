// Door B seller proof — live, read-only, $0. Pulls Praeco's listing from the PUBLIC
// CROO API (proving the seller registration is real right now) and prints the known
// on-chain settlement (order → paid → deliver on Base mainnet), best-effort-confirmed
// against a public Base RPC. Nothing here spends or needs auth.
import "dotenv/config";
import { getAgent, type AgentRecord } from "../src/cap/discovery.js";
import { baseUnitsToUsd } from "../src/constants.js";

export const PRAECO_SERVICE_ID = "5168a527-df1d-45fb-bcaa-a638f2a1fcf9";

export interface SettledOrder {
  orderId: string;
  deliverTx: string;
  contentHash: string;
  basescan: string;
  block: number;
}

export const SETTLED: SettledOrder = {
  orderId: "35673686-c363-45d2-b4ce-fdfb22a380fe",
  deliverTx: "0x97547499e592dc1b4390e3a11213502f9fabc0dec5fe5fba4e4362cdf886ad84",
  contentHash: "0xfa2bd434494d1d49daa35c925230587feee9ed6197559381496ab9bc3c14fc6c",
  basescan: "https://basescan.org/tx/0x97547499e592dc1b4390e3a11213502f9fabc0dec5fe5fba4e4362cdf886ad84",
  block: 48178130,
};

export interface Listing {
  agentName: string;
  serviceId: string;
  title: string;
  priceUsd: string;
}

export function extractListing(agent: AgentRecord, serviceId: string): Listing {
  const svc = agent.services.find((s) => s.serviceId === serviceId);
  if (!svc) {
    throw new Error(`Praeco listing ${serviceId} not found on the public CROO API (agent ${agent.agentId})`);
  }
  return { agentName: agent.name, serviceId, title: svc.title, priceUsd: baseUnitsToUsd(BigInt(svc.price)) };
}

export function formatProof(
  listing: Listing,
  settled: SettledOrder,
  onchain?: { block: number; ok: boolean },
): string[] {
  const lines = [
    "── PRAECO · Door B seller proof ──────────────────────────────",
    "",
    "  LIVE listing  (pulled from the public CROO API — verify it yourself)",
    `    agent       ${listing.agentName}`,
    `    service     ${listing.title}`,
    `    serviceId   ${listing.serviceId}`,
    `    price       $${listing.priceUsd}`,
    "",
    "  REAL settled order  (Base mainnet — immutable)",
    `    order       ${settled.orderId}`,
    "    lifecycle   accepted → paid → delivered",
    `    deliver tx  ${settled.deliverTx}`,
    `    contentHash ${settled.contentHash}`,
  ];
  if (onchain) {
    lines.push(`    on-chain    ${onchain.ok ? "confirmed success" : "seen"} in block ${onchain.block} (Base mainnet)`);
  }
  lines.push(`    verify      ${settled.basescan}`);
  lines.push("──────────────────────────────────────────────────────────────");
  return lines;
}

// Best-effort on-chain confirmation via a public Base RPC. Never throws — if the RPC
// is slow or unreachable, we simply skip the confirmation line (the Basescan link stands).
async function baseReceipt(txHash: string): Promise<{ block: number; ok: boolean } | undefined> {
  try {
    const res = await fetch("https://mainnet.base.org", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [txHash] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return undefined;
    const j = (await res.json()) as { result?: { blockNumber?: string; status?: string } };
    const r = j.result;
    if (!r?.blockNumber) return undefined;
    return { block: parseInt(r.blockNumber, 16), ok: r.status === "0x1" };
  } catch {
    return undefined;
  }
}

async function main() {
  const apiUrl = process.env.CROO_API_URL;
  const agentId = process.env.PRAECO_AGENT_ID;
  if (!apiUrl || !agentId) throw new Error("CROO_API_URL / PRAECO_AGENT_ID not set (.env)");
  const agent = await getAgent(apiUrl, agentId);
  const listing = extractListing(agent, PRAECO_SERVICE_ID);
  const onchain = await baseReceipt(SETTLED.deliverTx);
  console.log(formatProof(listing, SETTLED, onchain).join("\n"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
