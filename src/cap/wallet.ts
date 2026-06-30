/**
 * On-chain USDC balance for the agent-wallet funding gate (findings #1: an empty
 * agent wallet silently hangs every hire). Uses a raw JSON-RPC eth_call to the
 * ERC-20 balanceOf — no viem/ethers dependency.
 */
import { baseUnitsToUsd } from "../constants.js";

export type FetchFn = typeof fetch;

const BALANCE_OF_SELECTOR = "0x70a08231"; // balanceOf(address)

export async function getUsdcBalance(
  rpcUrl: string,
  wallet: string,
  tokenAddr: string,
  fetchImpl: FetchFn = fetch,
): Promise<bigint> {
  const addr = wallet.replace(/^0x/, "").toLowerCase().padStart(64, "0");
  const data = BALANCE_OF_SELECTOR + addr;
  const res = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: tokenAddr, data }, "latest"],
    }),
  });
  if (!res.ok) throw new Error(`RPC eth_call failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as { result?: string; error?: { message?: string } };
  if (json.error) throw new Error(`RPC eth_call error: ${json.error.message ?? "unknown"}`);
  if (!json.result || json.result === "0x") throw new Error(`RPC eth_call returned no balance for ${wallet}`);
  return BigInt(json.result);
}

export async function assertFunded(
  rpcUrl: string,
  wallet: string,
  tokenAddr: string,
  requiredBaseUnits: bigint,
  fetchImpl: FetchFn = fetch,
): Promise<void> {
  const bal = await getUsdcBalance(rpcUrl, wallet, tokenAddr, fetchImpl);
  if (bal < requiredBaseUnits) {
    throw new Error(
      `Agent wallet ${wallet} holds ${baseUnitsToUsd(bal)} USDC but needs ${baseUnitsToUsd(requiredBaseUnits)} — ` +
        `fund the agent wallet via agent.croo.network → My Agents → Top Up (gate #1).`,
    );
  }
}
