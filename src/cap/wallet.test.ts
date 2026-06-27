import { describe, it, expect } from "vitest";
import { getUsdcBalance, assertFunded } from "./wallet.js";

// 0x1e8480 = 2_000_000 base units = 2.00 USDC
const okFetch = (async () =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x00000000000000000000000000000000000000000000000000000000001e8480" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as unknown as typeof fetch;

const nonOkFetch = (async () =>
  new Response("err", { status: 500, statusText: "Internal Server Error" })) as unknown as typeof fetch;

const rpcErrorFetch = (async () =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: "execution reverted" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as unknown as typeof fetch;

const emptyResultFetch = (async () =>
  new Response(JSON.stringify({ result: "0x" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as unknown as typeof fetch;

describe("getUsdcBalance", () => {
  it("decodes the eth_call balanceOf result to base units", async () => {
    const bal = await getUsdcBalance("https://rpc", "0xee47A5bda206E188a2857F908E5E2E62C7DA7D31", "0x8335", okFetch);
    expect(bal).toBe(2_000_000n);
  });

  it("throws on non-ok HTTP response", async () => {
    await expect(
      getUsdcBalance("https://rpc", "0xee47", "0x8335", nonOkFetch),
    ).rejects.toThrow(/RPC eth_call failed/);
  });

  it("throws on JSON-RPC error object", async () => {
    await expect(
      getUsdcBalance("https://rpc", "0xee47", "0x8335", rpcErrorFetch),
    ).rejects.toThrow(/RPC eth_call error.*execution reverted/);
  });

  it("throws on empty result (0x)", async () => {
    await expect(
      getUsdcBalance("https://rpc", "0xee47", "0x8335", emptyResultFetch),
    ).rejects.toThrow(/RPC eth_call returned no balance/);
  });
});

describe("assertFunded", () => {
  it("passes when balance covers the requirement", async () => {
    await expect(assertFunded("https://rpc", "0xee47", "0x8335", 100_000n, okFetch)).resolves.toBeUndefined();
  });
  it("throws an actionable gate-#1 error when short", async () => {
    await expect(assertFunded("https://rpc", "0xee47", "0x8335", 5_000_000n, okFetch)).rejects.toThrow(/fund the agent wallet/i);
  });
});
