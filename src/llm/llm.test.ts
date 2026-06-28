import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createLlm, extractFirstJson } from "./llm.js";

// A fake completer returns scripted assistant content, ignoring inputs.
function fakeCompleter(texts: string[]) {
  let i = 0;
  return {
    complete: async () => ({ content: [{ type: "text", text: texts[Math.min(i++, texts.length - 1)] }] }),
  };
}
const model = { id: "glm-5.2:cloud" } as any;

describe("extractFirstJson", () => {
  it("pulls the first balanced JSON object out of reasoning noise", () => {
    expect(extractFirstJson('thinking... {"a":1} trailing')).toBe('{"a":1}');
    expect(extractFirstJson('{"a":{"b":[1,2]}} extra')).toBe('{"a":{"b":[1,2]}}');
  });
  it("throws when no object is present", () => {
    expect(() => extractFirstJson("no json here")).toThrow(/no JSON/i);
  });
});

describe("createLlm.completeText", () => {
  it("concatenates text blocks and trims", async () => {
    const llm = createLlm(fakeCompleter(["  PRAECO ONLINE  "]), model);
    expect(await llm.completeText("hi")).toBe("PRAECO ONLINE");
  });
});

describe("createLlm.completeJson", () => {
  it("parses and validates JSON against a zod schema", async () => {
    const llm = createLlm(fakeCompleter(['reason {"product":"Streaky","audience":"builders"}']), model);
    const out = await llm.completeJson("brief?", z.object({ product: z.string(), audience: z.string() }));
    expect(out).toEqual({ product: "Streaky", audience: "builders" });
  });

  it("repairs once when the first response is unparseable, then validates", async () => {
    const llm = createLlm(fakeCompleter(["totally not json", '{"product":"X","audience":"Y"}']), model);
    const out = await llm.completeJson("brief?", z.object({ product: z.string(), audience: z.string() }));
    expect(out.product).toBe("X");
  });

  it("throws an actionable error when both attempts fail validation", async () => {
    const llm = createLlm(fakeCompleter(["nope", "still nope"]), model);
    await expect(
      llm.completeJson("brief?", z.object({ product: z.string() })),
    ).rejects.toThrow(/failed to produce valid JSON/i);
  });
});
