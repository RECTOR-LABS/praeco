/**
 * High-level LLM facade over a pi-ai Models instance. GLM-5.2 is a reasoning
 * model that emits prose/thinking around its answer, so completeJson extracts
 * the first balanced JSON object, validates it with zod, and retries once with
 * a stricter instruction on failure. All downstream modules depend on this
 * narrow interface, which makes them trivial to unit-test with a fake.
 */
import type { Model } from "@earendil-works/pi-ai";
import type { ZodType } from "zod";

export interface LlmMessage {
  role: "user";
  content: string;
  timestamp: number;
}

export type CompleteFn = (
  model: Model<any>,
  context: { messages: LlmMessage[] },
) => Promise<{ content: Array<{ type: string; text?: string }> }>;

export interface Llm {
  completeText(prompt: string): Promise<string>;
  completeJson<T>(prompt: string, schema: ZodType<T>): Promise<T>;
}

/** Extract the first balanced top-level JSON object from arbitrary model text. */
export function extractFirstJson(raw: string): string {
  const start = raw.indexOf("{");
  if (start === -1) throw new Error("no JSON object found in model output");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  throw new Error("no balanced JSON object found in model output");
}

const textOf = (content: Array<{ type: string; text?: string }>): string =>
  content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");

export function createLlm(completer: { complete: CompleteFn }, model: Model<any>): Llm {
  const ask = async (prompt: string): Promise<string> => {
    const res = await completer.complete(model, {
      messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
    });
    return textOf(res.content).trim();
  };

  return {
    async completeText(prompt) {
      return ask(prompt);
    },
    async completeJson<T>(prompt: string, schema: ZodType<T>): Promise<T> {
      const attempt = async (p: string): Promise<T | null> => {
        const raw = await ask(p);
        try {
          return schema.parse(JSON.parse(extractFirstJson(raw)));
        } catch {
          return null;
        }
      };
      const first = await attempt(prompt);
      if (first !== null) return first;
      const strict =
        `${prompt}\n\nIMPORTANT: Respond with ONLY a single valid JSON object and no other text, ` +
        `no markdown fences, no commentary. The object must match the requested shape exactly.`;
      const second = await attempt(strict);
      if (second !== null) return second;
      throw new Error("LLM failed to produce valid JSON matching the schema after one repair attempt");
    },
  };
}
