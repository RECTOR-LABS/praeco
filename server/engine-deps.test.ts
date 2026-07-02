import { it, expect, beforeEach, vi } from "vitest";
import { buildSandboxDeps } from "./engine-deps.js";

vi.mock("@/src/config", () => ({ loadConfig: () => ({ crooApiUrl: "u", crooWsUrl: "w", crooSdkKey: "k", baseRpcUrl: "r", ollamaApiKey: "o", ollamaBaseUrl: "b", praecoAgentId: "id", praecoAgentWallet: "0x0", usdcTokenAddress: "0xu", runBudgetUsdc: "2.00", legCapUsdc: "0.60", preferredServiceIds: { research: "real-pin" } }) }));
vi.mock("@/src/llm/model", () => ({ createGlmModels: () => ({ models: { complete: vi.fn() }, model: {}, streamFn: vi.fn() }) }));
vi.mock("@/src/llm/llm", () => ({ createLlm: () => ({}) }));

beforeEach(() => {
  // Minimal env so loadConfig() passes (values unused by the mock path).
  Object.assign(process.env, {
    CROO_API_URL: "http://x", CROO_WS_URL: "ws://x", CROO_SDK_KEY: "k", BASE_RPC_URL: "http://x",
    OLLAMA_API_KEY: "k", OLLAMA_BASE_URL: "http://x", PRAECO_AGENT_ID: "a", PRAECO_AGENT_WALLET: "0xabc",
    SVC_RESEARCH: "real-pin", // must be cleared by sandbox
  });
});
it("sandbox deps use the mock client and clear live SVC_* pins", () => {
  const events: string[] = [];
  const deps = buildSandboxDeps((e) => events.push(e.kind), "run-x");
  expect(typeof deps.client.negotiateOrder).toBe("function");
  expect(deps.config.preferredServiceIds).toEqual({}); // pins cleared for the mock catalog
  expect(deps.onEvent).toBeTypeOf("function");
});

it("buildLiveDepsWith reuses the passed client (no new AgentClient/WS)", async () => {
  const { buildLiveDepsWith } = await import("./engine-deps.js");
  const client = { marker: "shared" };
  const deps = buildLiveDepsWith(client as never, () => {}, "run-1");
  expect(deps.client).toBe(client);
  expect(deps.runId).toBe("run-1");
});
