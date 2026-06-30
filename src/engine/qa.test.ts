import { describe, it, expect, vi } from "vitest";
import { reviewDeliverable, qaVerdictSchema } from "./qa.js";
import type { Llm } from "../llm/llm.js";
import type { LaunchBrief } from "../types.js";

const brief: LaunchBrief = { product: "Streaky", audience: "builders", features: ["streaks"], tone: "playful", oneLiner: "Track habits." };

function fakeLlm(verdict: unknown): Llm {
  return {
    completeText: vi.fn(async () => ""),
    completeJson: vi.fn(async () => verdict) as Llm["completeJson"],
  };
}

describe("reviewDeliverable", () => {
  it("returns the critic verdict and feeds the deliverable + brief into the prompt", async () => {
    const llm = fakeLlm({ action: "accept", reason: "on-brief", score: 82 });
    const verdict = await reviewDeliverable(llm, brief, "landing_copy", { type: "text", text: "Great copy about habit streaks", contentHash: "0x" });
    expect(verdict).toEqual({ action: "accept", reason: "on-brief", score: 82 });
    const prompt = (llm.completeJson as any).mock.calls[0][0] as string;
    expect(prompt).toContain("Streaky");
    expect(prompt).toContain("landing_copy");
    expect(prompt).toContain("habit streaks");
    expect(prompt).toContain("builders");
    expect(prompt).toContain("playful");
    expect((llm.completeJson as any).mock.calls[0][1]).toBe(qaVerdictSchema);
  });

  it("passes through a redo verdict", async () => {
    const llm = fakeLlm({ action: "redo", reason: "off-tone" });
    const verdict = await reviewDeliverable(llm, brief, "research", { type: "schema", schema: { weak: true }, contentHash: "0x" });
    expect(verdict.action).toBe("redo");
  });
});
