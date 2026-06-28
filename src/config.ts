/**
 * Loads and validates Praeco's runtime configuration from environment variables.
 * Fails fast (naming the offending var) so a misconfigured deploy never reaches
 * a live CAP call with a missing key.
 */
import type { LegKind } from "./types.js";
import { BASE_USDC_ADDRESS, DEFAULT_RUN_BUDGET_USDC, DEFAULT_LEG_CAP_USDC } from "./constants.js";

export interface Config {
  crooApiUrl: string;
  crooWsUrl: string;
  crooSdkKey: string;
  baseRpcUrl: string;
  ollamaApiKey: string;
  ollamaBaseUrl: string;
  praecoAgentId: string;
  praecoAgentWallet: string;
  usdcTokenAddress: string;
  runBudgetUsdc: string;
  legCapUsdc: string;
  preferredServiceIds: Partial<Record<LegKind, string>>;
}

const REQUIRED = [
  "CROO_API_URL",
  "CROO_WS_URL",
  "CROO_SDK_KEY",
  "BASE_RPC_URL",
  "OLLAMA_API_KEY",
  "OLLAMA_BASE_URL",
  "PRAECO_AGENT_ID",
  "PRAECO_AGENT_WALLET",
] as const;

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): Config {
  for (const key of REQUIRED) {
    if (!env[key]) throw new Error(`Missing required env var: ${key}`);
  }
  const preferredServiceIds: Partial<Record<LegKind, string>> = {};
  if (env.SVC_RESEARCH) preferredServiceIds.research = env.SVC_RESEARCH;
  if (env.SVC_LANDING) preferredServiceIds.landing_copy = env.SVC_LANDING;
  if (env.SVC_IMAGE) preferredServiceIds.og_image = env.SVC_IMAGE;
  return {
    crooApiUrl: env.CROO_API_URL!,
    crooWsUrl: env.CROO_WS_URL!,
    crooSdkKey: env.CROO_SDK_KEY!,
    baseRpcUrl: env.BASE_RPC_URL!,
    ollamaApiKey: env.OLLAMA_API_KEY!,
    ollamaBaseUrl: env.OLLAMA_BASE_URL!,
    praecoAgentId: env.PRAECO_AGENT_ID!,
    praecoAgentWallet: env.PRAECO_AGENT_WALLET!,
    usdcTokenAddress: env.USDC_TOKEN_ADDRESS ?? BASE_USDC_ADDRESS,
    runBudgetUsdc: env.RUN_BUDGET_USDC ?? DEFAULT_RUN_BUDGET_USDC,
    legCapUsdc: env.LEG_CAP_USDC ?? DEFAULT_LEG_CAP_USDC,
    preferredServiceIds,
  };
}
