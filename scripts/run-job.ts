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

const LIVE = process.env.ENGINE_LIVE === "1";
const input = process.env.JOB_REPO
  ? { repoUrl: process.env.JOB_REPO }
  : { text: process.env.JOB_TEXT ?? "A privacy-first habit tracker named Streaky for indie developers." };

const cfg = loadConfig();
const { models, model, streamFn } = createGlmModels();
// Thin adapter: keeps llm.ts decoupled from pi-ai's generic Models type.
const llm = createLlm({ complete: (m, c) => models.complete(m, c) }, model);

// --- Mock marketplace for the no-money smoke ---
// Mirrors the LIVE CAP public shapes exactly (object-wrapped {items}/{agents}/{agent},
// percent completionRate, name-as-title, JSON-string requirementSchema) so the smoke
// exercises the same parsing path as a real run instead of validating fiction.
function mockFetch(): FetchFn {
  const services = {
    items: [
      { serviceId: "mock-research", agentId: "ma1", name: "Verifiable Research", description: "market research and competitive analysis", price: "100000", orders7d: "30" },
      { serviceId: "mock-copy", agentId: "ma2", name: "Landing Page Copy", description: "landing page copywriting and content", price: "100000", orders7d: "80" },
      { serviceId: "mock-image", agentId: "ma3", name: "OG Image", description: "og image generation and visual design", price: "500000", orders7d: "25" },
    ],
    total: "3",
  };
  const agentsCatalog = {
    agents: [
      { agentId: "ma1", name: "ProofResearch", completedOrders: "500", completionRate: 98, onlineStatus: "online", skillTagSlugs: ["research-report"] },
      { agentId: "ma2", name: "Foundr", completedOrders: "500", completionRate: 98, onlineStatus: "online", skillTagSlugs: ["content-creative"] },
      { agentId: "ma3", name: "Pygm Studio", completedOrders: "500", completionRate: 98, onlineStatus: "online", skillTagSlugs: ["content-creative"] },
    ],
    total: "3",
  };
  const svc: Record<string, { serviceId: string; name: string; price: string }> = {
    ma1: { serviceId: "mock-research", name: "Verifiable Research", price: "100000" },
    ma2: { serviceId: "mock-copy", name: "Landing Page Copy", price: "100000" },
    ma3: { serviceId: "mock-image", name: "OG Image", price: "500000" },
  };
  const reqSchema = JSON.stringify([{ name: "brief", type: "string", required: true, description: "", stringSubtype: "plain" }]);
  const agentRecord = (id: string) => {
    const cat = agentsCatalog.agents.find((a) => a.agentId === id);
    const s = svc[id];
    return { agent: { ...cat, services: s ? [{ ...s, requirementType: "schema", requirementSchema: reqSchema, requirementText: "", deliverableType: "text" }] : [] } };
  };
  return (async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return new Response(JSON.stringify({ result: "0x00000000000000000000000000000000000000000000000000000000004c4b40" }), { status: 200 }); // 5 USDC
    const u = String(url);
    const m = u.match(/\/public\/agents\/([^/?]+)/);
    if (m) return new Response(JSON.stringify(agentRecord(m[1])), { status: 200 });
    if (u.includes("/public/agents")) return new Response(JSON.stringify(agentsCatalog), { status: 200 });
    if (u.includes("/public/services")) return new Response(JSON.stringify(u.includes("page=1") ? services : { items: [], total: "3" }), { status: 200 });
    return new Response("not found", { status: 404 });
  }) as unknown as FetchFn;
}

function mockClient(): CapBuyer {
  let n = 0;
  let lastNeg = "";
  // orderId → serviceId: set at negotiate time so getDelivery is retry-safe
  const orderService: Record<string, string> = {};

  // Keyed by serviceId — each provider always returns the same type of content
  const serviceDeliverables: Record<string, { deliverableType: string; deliverableText: string }> = {
    "mock-research": {
      deliverableType: "text",
      deliverableText:
        "Market research: privacy-first habit trackers resonate with indie developers (25-40). " +
        "Top pains: guilt-driven streak loss, data exfiltration by SaaS vendors, tool sprawl across paid tiers. " +
        "Competitive whitespace: incumbents (Habitica, Streaks) skew gamified and cloud-dependent. " +
        "Positioning opportunity = calm, local-first, no mandatory cloud, developer CLI. " +
        "Willingness to pay: one-time purchase preferred; OSS with optional self-hosted sync resonates strongly.",
    },
    "mock-copy": {
      deliverableType: "text",
      deliverableText:
        "Headline: Streaky — habit tracking, local-first.\n" +
        "Subhead: Privacy-first habit tracker built for indie developers. Your data stays on your machine. " +
        "No account. No cloud dependency. No subscription.\n" +
        "Features: Local SQLite store · AES-256 encrypted export · CLI + lightweight web UI · Zero telemetry · Self-hostable sync.\n" +
        "CTA: Install now — npm install -g streaky — MIT licensed, open source.",
    },
    "mock-image": {
      deliverableType: "text",
      deliverableText:
        "https://images.mock.local/streaky-og-1200x630.png\n" +
        "OG image spec: dark background (#0D1117), 'Streaky' in bold monospace center-left, " +
        "tagline 'Private. Local. Yours.' in muted grey (#6B7280) below, right panel shows a minimal " +
        "streak-calendar grid. 1200×630px optimised for Twitter/LinkedIn preview cards. " +
        "Minimal indie-dev aesthetic — no gradients, no stock imagery.",
    },
  };
  const servicePrices: Record<string, string> = {
    "mock-research": "100000",
    "mock-copy": "100000",
    "mock-image": "500000",
  };

  return {
    negotiateOrder: async (req) => {
      const id = `neg-${++n}`;
      lastNeg = id;
      orderService[`ord-${n}`] = req.serviceId;
      return { negotiationId: id };
    },
    getNegotiation: async () => ({ status: "pending" }),
    listOrders: async () => {
      const orderId = `ord-${n}`;
      const svcId = orderService[orderId] ?? "mock-research";
      return [{ orderId, negotiationId: lastNeg, price: servicePrices[svcId] ?? "100000", status: "created" }];
    },
    getOrder: async (id: string) => ({ status: "created", price: servicePrices[orderService[id] ?? "mock-research"] ?? "100000", deliverTxHash: `0xmockdeliver-${id}` }),
    payOrder: async () => ({ txHash: `0xmockpay${n}` }),
    getDelivery: async (id: string) => {
      const svcId = orderService[id] ?? "mock-research";
      const d = serviceDeliverables[svcId] ?? serviceDeliverables["mock-research"];
      return { ...d, contentHash: `0xmockhash${id}` };
    },
  };
}

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
      ? { negotiationPolls: 80, negotiationDelayMs: 2000, deliveryPolls: 90, deliveryDelayMs: 4000 }
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
