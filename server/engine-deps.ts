import { AgentClient } from "@croo-network/sdk";
import { loadConfig } from "@/src/config";
import { createGlmModels } from "@/src/llm/model";
import { createLlm } from "@/src/llm/llm";
import { mockClient, mockFetch } from "@/src/cap/mock";
import type { RunDeps } from "@/src/engine/run";
import type { CapBuyer } from "@/src/cap/hire";
import type { FetchFn } from "@/src/cap/wallet";
import type { WorklogEvent } from "@/src/types";

function glm() {
  const { models, model, streamFn } = createGlmModels();
  const llm = createLlm({ complete: (m, c) => models.complete(m, c) }, model);
  return { model, streamFn, llm };
}

export function buildSandboxDeps(onEvent: (e: WorklogEvent) => void, runId: string): RunDeps {
  const config = loadConfig();
  config.preferredServiceIds = {}; // mock catalog has no real SVC_* ids → clear pins (fail-closed otherwise)
  const { model, streamFn, llm } = glm();
  return { config, llm, client: mockClient(), model, streamFn, fetchImpl: mockFetch(), onEvent, runId };
}

export async function buildLiveDeps(onEvent: (e: WorklogEvent) => void, runId: string): Promise<{ deps: RunDeps; close: () => void }> {
  const config = loadConfig();
  const live = new AgentClient({ baseURL: config.crooApiUrl, wsURL: config.crooWsUrl, rpcURL: config.baseRpcUrl }, config.crooSdkKey);
  await live.connectWebSocket();
  const { model, streamFn, llm } = glm();
  const deps: RunDeps = {
    config, llm, client: live as unknown as CapBuyer, model, streamFn, fetchImpl: fetch as FetchFn, onEvent, runId,
    hirePollOpts: { negotiationPolls: 80, negotiationDelayMs: 2000, deliveryPolls: 120, deliveryDelayMs: 5000 },
  };
  return { deps, close: () => (live as unknown as { close?: () => void }).close?.() };
}

/** Build live engine deps that REUSE an existing AgentClient — so the Door B
 *  provider WS and the engine's buyer role share ONE connection on the SDK key
 *  (a second WS on the same key is fatal, close-1008). */
export function buildLiveDepsWith(client: unknown, onEvent: (e: WorklogEvent) => void, runId: string): RunDeps {
  const config = loadConfig();
  const { model, streamFn, llm } = glm();
  return {
    config, llm, client: client as CapBuyer, model, streamFn,
    fetchImpl: fetch as FetchFn, onEvent, runId,
    hirePollOpts: { negotiationPolls: 80, negotiationDelayMs: 2000, deliveryPolls: 120, deliveryDelayMs: 5000 },
  };
}
