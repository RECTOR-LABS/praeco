/**
 * Phase-0 Task 3 — GLM-5.2 via pi-ai (Ollama Cloud) smoke.
 * The key is an Ollama Cloud key; GLM-5.2 is served at https://ollama.com/v1
 * (OpenAI-compatible). We register a custom provider via createProvider().
 * GLM-5.2 is a reasoning model, so compat.supportsDeveloperRole=false (Ollama
 * doesn't grok the `developer` role) and we allow ample output tokens so the
 * model gets past its reasoning to the actual answer.
 * Verifies: basic generation, JSON output, and tool-calling.
 */
import "dotenv/config";
import { Type, createModels, createProvider, envApiKeyAuth, type Model } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

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

const ollamaCloud = createProvider({
  id: "ollama-cloud",
  name: "Ollama Cloud",
  baseUrl: "https://ollama.com/v1",
  auth: { apiKey: envApiKeyAuth("Ollama API key", ["OLLAMA_API_KEY"]) },
  models: [glm],
  api: openAICompletionsApi(),
});

const models = createModels();
models.setProvider(ollamaCloud);

const model = models.getModel("ollama-cloud", "glm-5.2:cloud");
if (!model) throw new Error("Model ollama-cloud/glm-5.2:cloud not found");
console.log("[model] glm-5.2:cloud ready");

type Block = { type: string; text?: string; name?: string; arguments?: unknown };
const textOf = (content: Block[]): string =>
  content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");

// 1. Basic generation
const basic = await models.complete(model, {
  messages: [{ role: "user", content: "Reply with exactly: PRAECO ONLINE", timestamp: Date.now() }],
});
console.log("[basic]", textOf(basic.content as Block[]).trim());
console.log("[debug]", JSON.stringify({
  stopReason: (basic as { stopReason?: unknown }).stopReason,
  errorMessage: (basic as { errorMessage?: unknown }).errorMessage,
}));

// 2. Structured JSON (intake brief shape)
const json = await models.complete(model, {
  messages: [{
    role: "user",
    content: 'Return ONLY compact JSON {"product":string,"audience":string} for a habit-tracker app named Streaky. No prose.',
    timestamp: Date.now(),
  }],
});
console.log("[json]", textOf(json.content as Block[]).trim().slice(0, 240));

// 3. Tool-calling (orchestrator-critical)
const tooled = await models.complete(model, {
  messages: [{ role: "user", content: "Hire a research specialist for the product 'Streaky'.", timestamp: Date.now() }],
  tools: [{
    name: "hire_agent",
    description: "Hire a specialist agent by role",
    parameters: Type.Object({ role: Type.String({ description: "e.g. research, copy, image" }) }),
  }],
});
const calls = (tooled.content as Block[]).filter((b) => b.type === "toolCall");
console.log("[tools]", calls.length ? JSON.stringify(calls.map((c) => ({ name: c.name, args: c.arguments }))) : "none");

console.log("[usage]", JSON.stringify((basic as { usage?: unknown }).usage));
