import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

const fullEnv = {
  CROO_API_URL: "a",
  CROO_WS_URL: "b",
  CROO_SDK_KEY: "c",
  BASE_RPC_URL: "d",
  OLLAMA_API_KEY: "e",
  OLLAMA_BASE_URL: "f",
};

describe("loadConfig", () => {
  it("throws, naming the missing var, when a required var is absent", () => {
    expect(() => loadConfig({})).toThrow(/CROO_API_URL/);
  });

  it("throws, naming a specific missing var, when only one is absent", () => {
    const { OLLAMA_API_KEY, ...partial } = fullEnv;
    expect(() => loadConfig(partial)).toThrow(/OLLAMA_API_KEY/);
  });

  it("returns a populated config when all required vars are present", () => {
    const cfg = loadConfig(fullEnv);
    expect(cfg.crooApiUrl).toBe("a");
    expect(cfg.crooWsUrl).toBe("b");
    expect(cfg.crooSdkKey).toBe("c");
    expect(cfg.baseRpcUrl).toBe("d");
    expect(cfg.ollamaApiKey).toBe("e");
    expect(cfg.ollamaBaseUrl).toBe("f");
  });
});
