import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

const fullEnv = {
  CROO_API_URL: "a",
  CROO_WS_URL: "b",
  CROO_SDK_KEY: "c",
  BASE_RPC_URL: "d",
  OLLAMA_API_KEY: "e",
  OLLAMA_BASE_URL: "f",
  PRAECO_AGENT_ID: "agent-1",
  PRAECO_AGENT_WALLET: "0xee47",
};

describe("loadConfig", () => {
  it("throws, naming the missing var, when a required var is absent", () => {
    expect(() => loadConfig({})).toThrow(/CROO_API_URL/);
  });

  it("throws, naming a specific missing var, when only one is absent", () => {
    const { PRAECO_AGENT_WALLET, ...partial } = fullEnv;
    expect(() => loadConfig(partial)).toThrow(/PRAECO_AGENT_WALLET/);
  });

  it("returns a populated config with defaults applied", () => {
    const cfg = loadConfig(fullEnv);
    expect(cfg.crooApiUrl).toBe("a");
    expect(cfg.praecoAgentId).toBe("agent-1");
    expect(cfg.praecoAgentWallet).toBe("0xee47");
    expect(cfg.usdcTokenAddress.toLowerCase()).toBe("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
    expect(cfg.runBudgetUsdc).toBe("2.00");
    expect(cfg.legCapUsdc).toBe("0.60");
    expect(cfg.preferredServiceIds).toEqual({});
  });

  it("maps SVC_* preferred service ids by leg", () => {
    const cfg = loadConfig({ ...fullEnv, SVC_RESEARCH: "r1", SVC_IMAGE: "i1" });
    expect(cfg.preferredServiceIds).toEqual({ research: "r1", og_image: "i1" });
  });
});
