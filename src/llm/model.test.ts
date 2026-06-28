import { describe, it, expect, beforeEach } from "vitest";
import { createGlmModels } from "./model.js";

beforeEach(() => {
  process.env.OLLAMA_API_KEY = "test-key";
});

describe("createGlmModels", () => {
  it("builds the glm-5.2:cloud model and a callable streamFn", () => {
    const { models, model, streamFn } = createGlmModels();
    expect(model.id).toBe("glm-5.2:cloud");
    expect(model.provider).toBe("ollama-cloud");
    expect(models.getModel("ollama-cloud", "glm-5.2:cloud")?.id).toBe("glm-5.2:cloud");
    expect(typeof streamFn).toBe("function");
  });
});
