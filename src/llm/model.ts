/**
 * GLM-5.2 (Ollama Cloud, OpenAI-compatible) model factory.
 * Extracted from the proven Phase-0 scripts/llm-smoke.ts wiring. GLM-5.2 is a
 * reasoning model served at https://ollama.com/v1; we register it as a custom
 * provider. compat flags disable the `developer` role and reasoning-effort
 * params that Ollama's endpoint does not accept.
 */
import {
  createModels,
  createProvider,
  envApiKeyAuth,
  type Model,
  type MutableModels,
  type Context,
  type SimpleStreamOptions,
  type Api,
  type AssistantMessageEventStream,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

export type StreamFn = (
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
) => AssistantMessageEventStream;

const glm: Model<"openai-completions"> = {
  id: "glm-5.2:cloud",
  name: "GLM-5.2 (Ollama Cloud)",
  api: "openai-completions",
  provider: "ollama-cloud",
  baseUrl: "https://ollama.com/v1",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 200000,
  maxTokens: 8000,
  compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
} as Model<"openai-completions">;

export function createGlmModels(): {
  models: MutableModels;
  model: Model<"openai-completions">;
  streamFn: StreamFn;
} {
  const provider = createProvider({
    id: "ollama-cloud",
    name: "Ollama Cloud",
    baseUrl: "https://ollama.com/v1",
    auth: { apiKey: envApiKeyAuth("Ollama API key", ["OLLAMA_API_KEY"]) },
    models: [glm],
    api: openAICompletionsApi(),
  });
  const models = createModels();
  models.setProvider(provider);
  const model = models.getModel("ollama-cloud", "glm-5.2:cloud") as Model<"openai-completions">;
  if (!model) throw new Error("Model ollama-cloud/glm-5.2:cloud not found after registration");
  const streamFn: StreamFn = (m, context, options) => models.streamSimple(m, context, options);
  return { models, model, streamFn };
}
