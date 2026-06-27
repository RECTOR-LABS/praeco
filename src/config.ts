/**
 * Loads and validates Praeco's runtime configuration from environment variables.
 * Fails fast (naming the offending var) so a misconfigured deploy never reaches
 * a live CAP call with a missing key.
 */
export interface Config {
  crooApiUrl: string;
  crooWsUrl: string;
  crooSdkKey: string;
  baseRpcUrl: string;
  ollamaApiKey: string;
  ollamaBaseUrl: string;
}

const REQUIRED = [
  "CROO_API_URL",
  "CROO_WS_URL",
  "CROO_SDK_KEY",
  "BASE_RPC_URL",
  "OLLAMA_API_KEY",
  "OLLAMA_BASE_URL",
] as const;

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): Config {
  for (const key of REQUIRED) {
    if (!env[key]) throw new Error(`Missing required env var: ${key}`);
  }
  return {
    crooApiUrl: env.CROO_API_URL!,
    crooWsUrl: env.CROO_WS_URL!,
    crooSdkKey: env.CROO_SDK_KEY!,
    baseRpcUrl: env.BASE_RPC_URL!,
    ollamaApiKey: env.OLLAMA_API_KEY!,
    ollamaBaseUrl: env.OLLAMA_BASE_URL!,
  };
}
