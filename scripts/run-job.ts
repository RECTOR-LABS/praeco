/**
 * Praeco engine CLI.
 *   pnpm engine:smoke  — real GLM-5.2 drives the loop against a MOCK marketplace
 *                        (no money, no chain). Proves the agent loop end-to-end.
 *   pnpm engine:run    — LIVE: real GLM + real CAP. Real USDC on Base. Run
 *                        deliberately, with RECTOR's authorization. ~$0.30/run.
 *
 * Input: JOB_REPO=<github url>  OR  JOB_TEXT="<one-liner>" (defaults provided).
 * Output: runs/<runId>.json (full RunRecord with Basescan receipts).
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { AgentClient } from "@croo-network/sdk";
import { loadConfig } from "../src/config.js";
import { createGlmModels } from "../src/llm/model.js";
import { createLlm } from "../src/llm/llm.js";
import { runLaunchJob } from "../src/engine/run.js";
import type { CapBuyer } from "../src/cap/hire.js";
import type { FetchFn } from "../src/cap/wallet.js";
import { mockFetch, mockClient } from "../src/cap/mock.js";

const LIVE = process.env.ENGINE_LIVE === "1";
const input = process.env.JOB_REPO
  ? { repoUrl: process.env.JOB_REPO }
  : { text: process.env.JOB_TEXT ?? "A privacy-first habit tracker named Streaky for indie developers." };

const cfg = loadConfig();
// The smoke runs against a MOCK catalog (mock-* serviceIds), so real-marketplace
// SVC_* pins from .env don't apply — clear them or the authoritative pin fails
// closed (pinned id absent from the mock catalog → no candidates). Pins are a
// live-run operator override only.
if (!LIVE) cfg.preferredServiceIds = {};
const { models, model, streamFn } = createGlmModels();
// Thin adapter: keeps llm.ts decoupled from pi-ai's generic Models type.
const llm = createLlm({ complete: (m, c) => models.complete(m, c) }, model);


async function main() {
  let client: CapBuyer;
  let fetchImpl: FetchFn;
  let ws: { close?: () => void } | undefined;

  if (LIVE) {
    const live = new AgentClient(
      { baseURL: cfg.crooApiUrl, wsURL: cfg.crooWsUrl, rpcURL: cfg.baseRpcUrl },
      cfg.crooSdkKey,
    );
    await live.connectWebSocket(); // presence: providers won't transact with an offline requester
    console.log("[ws] online — LIVE mainnet run; real USDC will be spent");
    client = live as unknown as CapBuyer;
    fetchImpl = fetch as FetchFn;
    ws = live as unknown as { close?: () => void };
  } else {
    console.log("[smoke] mock marketplace — no money, no chain");
    client = mockClient();
    fetchImpl = mockFetch();
  }

  const rec = await runLaunchJob(input, {
    config: cfg, llm, client, model, streamFn, fetchImpl,
    // LIVE: tolerate slow on-chain finalization (~25s+ to "created") and the
    // provider's delivery SLA (orders carry deliveryWindow=600s). Defaults are
    // tighter and fine for the mock smoke.
    hirePollOpts: LIVE
      ? { negotiationPolls: 80, negotiationDelayMs: 2000, deliveryPolls: 120, deliveryDelayMs: 5000 } // delivery: 120×5s = 600s, matching the order's deliveryWindow SLA
      : undefined,
    onEvent: (e) => console.log(`  • [${e.kind}]${e.leg ? " " + e.leg : ""} ${e.message}`),
  });

  mkdirSync("runs", { recursive: true });
  const path = `runs/${rec.runId}.json`;
  writeFileSync(path, JSON.stringify(rec, null, 2));

  console.log(`\n=== ${rec.status.toUpperCase()} — ${rec.assets.length}/${rec.brief ? 3 : 0} legs, spent $${(Number(rec.spentBaseUnits) / 1e6).toFixed(2)} ===`);
  for (const a of rec.assets) {
    console.log(`  ${a.leg}: ${a.provenance.agentName} $${a.provenance.amountUsd} — ${a.provenance.basescanUrl}`);
  }
  if (rec.kit) {
    console.log(`\n  landingCopy: ${rec.kit.landingCopy.slice(0, 120)}…`);
    console.log(`  ogImageRef: ${rec.kit.ogImageRef}`);
    console.log(`  tweet 1/: ${rec.kit.tweetThread[0] ?? "(none)"}`);
  }
  console.log(`\n[saved] ${path}`);
  ws?.close?.();
  process.exit(rec.status === "completed" ? 0 : 1);
}

main().catch((e) => {
  console.error("[fatal]", e);
  process.exit(1);
});
