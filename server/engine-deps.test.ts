import { describe, it, expect, beforeEach } from "vitest";
import { buildSandboxDeps } from "./engine-deps.js";

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
