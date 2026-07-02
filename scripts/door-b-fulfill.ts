// Door B fulfillment CLI. Real: one shared AgentClient (provider + buyer roles, one WS).
// --sim: mock provider + sandbox engine ($0, no chain). --watch: poll loop.
import "dotenv/config";
import { AgentClient } from "@croo-network/sdk";
import { loadConfig } from "../src/config.js";
import { runLaunchJob } from "../src/engine/run.js";
import { AgentClientProvider } from "../src/cap/provider.js";
import { mockProvider } from "../src/cap/mock-provider.js";
import { assertFunded } from "../src/cap/wallet.js";
import { buildSandboxDeps, buildLiveDepsWith } from "../server/engine-deps.js";
import { fulfillOrder } from "../server/fulfill-order.js";
import type { IntakeInput } from "../src/engine/intake.js";

const sim = process.argv.includes("--sim");
const watch = process.argv.includes("--watch");
const log = (m: string) => console.log(`[door-b] ${m}`);

async function once() {
  if (sim) {
    const provider = mockProvider({ brief: "A privacy-first habit tracker for indie developers" });
    const runJob = (input: IntakeInput) => runLaunchJob(input, buildSandboxDeps(() => {}, `live-${Date.now()}`));
    return fulfillOrder({ provider, runJob, poll: { attempts: 10, delayMs: 200 }, onLog: log });
  }
  const cfg = loadConfig();
  const client = new AgentClient({ baseURL: cfg.crooApiUrl, wsURL: cfg.crooWsUrl, rpcURL: cfg.baseRpcUrl }, cfg.crooSdkKey);
  await client.connectWebSocket(); // presence; providers won't transact with an offline agent
  try {
    const provider = new AgentClientProvider(client as never);
    const runJob = (input: IntakeInput) =>
      runLaunchJob(input, buildLiveDepsWith(client, () => {}, `live-${Date.now()}`)); // shared client — one WS
    const assertFundedFn = () => assertFunded(cfg.baseRpcUrl, cfg.praecoAgentWallet, cfg.usdcTokenAddress, 1n, fetch as never);
    return await fulfillOrder({ provider, runJob, assertFunded: assertFundedFn, onLog: log });
  } finally {
    (client as unknown as { close?: () => void }).close?.();
  }
}

async function main() {
  if (!watch) { const r = await once(); log(`result: ${JSON.stringify(r)}`); return; }
  log("watch mode — polling every 15s (Ctrl-C to stop)");
  for (;;) { const r = await once(); if (r.status !== "skipped") log(`result: ${JSON.stringify(r)}`); await new Promise((s) => setTimeout(s, 15000)); }
}
main().catch((e) => { console.error("[door-b] fatal:", (e as Error).message); process.exit(1); });
