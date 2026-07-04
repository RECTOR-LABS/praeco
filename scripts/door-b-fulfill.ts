// Door B fulfillment CLI. Real: one shared AgentClient + WS for the whole process
// lifetime (provider + buyer roles) — constructed once and reused across every
// --watch iteration; a second WS on the same CROO_SDK_KEY is fatal, close-1008.
// --sim: mock provider + sandbox engine ($0, no chain). --watch: poll loop.
import "dotenv/config";
import { AgentClient } from "@croo-network/sdk";
import { loadConfig } from "../src/config.js";
import { runLaunchJob } from "../src/engine/run.js";
import { AgentClientProvider } from "../src/cap/provider.js";
import { mockProvider } from "../src/cap/mock-provider.js";
import { assertFunded } from "../src/cap/wallet.js";
import { listServices } from "../src/cap/discovery.js";
import { checkFulfillability, findStalePins } from "../src/cap/fulfillability.js";
import { mockFetch } from "../src/cap/mock.js";
import { buildSandboxDeps, buildLiveDepsWith } from "../server/engine-deps.js";
import { fulfillOrder } from "../server/fulfill-order.js";
import type { IntakeInput } from "../src/engine/intake.js";

const sim = process.argv.includes("--sim");
const watch = process.argv.includes("--watch");
const log = (m: string) => console.log(`[door-b] ${m}`);

// Drives `run` once (no --watch), or forever every 15s (--watch), logging every
// non-skipped result. Shared by the sim and real paths — only what `run` closes
// over differs between them.
async function runLoop(run: () => ReturnType<typeof fulfillOrder>) {
  if (!watch) { const r = await run(); log(`result: ${JSON.stringify(r)}`); return; }
  log("watch mode — polling every 15s (Ctrl-C to stop)");
  for (;;) { const r = await run(); if (r.status !== "skipped") log(`result: ${JSON.stringify(r)}`); await new Promise((s) => setTimeout(s, 15000)); }
}

async function main() {
  if (sim) {
    // Mirror buildSandboxDeps: assess over the MOCK catalog with pins CLEARED
    // (the real stale SVC_* would reject every sim order otherwise — spec §12).
    const cfg = loadConfig();
    const mfetch = mockFetch();
    const checkFulfillable = () => checkFulfillability({ ...cfg, preferredServiceIds: {} }, mfetch);
    return runLoop(() => {
      const provider = mockProvider({ brief: "A privacy-first habit tracker for indie developers" });
      const runJob = (input: IntakeInput) => runLaunchJob(input, buildSandboxDeps(() => {}, `live-${Date.now()}`));
      return fulfillOrder({ provider, runJob, checkFulfillable, poll: { attempts: 10, delayMs: 200 }, onLog: log });
    });
  }

  // Real path: construct the client + WS exactly once, not per fulfill attempt —
  // reused for every --watch iteration (or the single one-shot call).
  const cfg = loadConfig();
  const client = new AgentClient({ baseURL: cfg.crooApiUrl, wsURL: cfg.crooWsUrl, rpcURL: cfg.baseRpcUrl }, cfg.crooSdkKey);
  const stream = await client.connectWebSocket(); // presence; providers won't transact with an offline agent
  try {
    // Pin hygiene: warn once on any pinned SVC_* absent from the live catalog
    // (fail-closed still protects money — this is visibility, not enforcement).
    for (const { leg, serviceId } of findStalePins(await listServices(cfg.crooApiUrl, fetch as never), cfg.preferredServiceIds)) {
      log(`WARNING: pinned ${leg} service ${serviceId} is not in the live catalog (stale pin — that leg is unfulfillable until refreshed)`);
    }
    const provider = new AgentClientProvider(client as never);
    const runJob = (input: IntakeInput) =>
      runLaunchJob(input, buildLiveDepsWith(client, () => {}, `live-${Date.now()}`)); // shared client — one WS
    const assertFundedFn = () => assertFunded(cfg.baseRpcUrl, cfg.praecoAgentWallet, cfg.usdcTokenAddress, 1n, fetch as never);
    const checkFulfillable = () => checkFulfillability(cfg, fetch as never);
    await runLoop(() => fulfillOrder({ provider, runJob, assertFunded: assertFundedFn, checkFulfillable, onLog: log }));
  } finally {
    stream.close?.(); // EventStream's close — AgentClient itself has no close()
  }
}
main().catch((e) => { console.error("[door-b] fatal:", (e as Error).message); process.exit(1); });
