import { describe, it, expect, vi } from "vitest";
import { reviewDeliverable, qaVerdictSchema, formatGate } from "./qa.js";
import type { Llm } from "../llm/llm.js";
import type { LaunchBrief, Deliverable } from "../types.js";

const brief: LaunchBrief = { product: "Streaky", audience: "builders", features: ["streaks"], tone: "playful", oneLiner: "Track habits." };

function fakeLlm(verdict: unknown): Llm {
  return {
    completeText: vi.fn(async () => ""),
    completeJson: vi.fn(async () => verdict) as Llm["completeJson"],
  };
}

const textDeliverable = (text: string): Deliverable => ({ type: "text", text, contentHash: "0x" });
const SUBSTANTIVE =
  "Market research shows privacy-first habit trackers resonate with indie developers who want " +
  "local-first tools, no mandatory cloud, and a one-time purchase over subscriptions, with strong " +
  "open-source positioning against gamified incumbents.";

describe("reviewDeliverable", () => {
  it("returns the critic verdict and feeds the deliverable + brief into the prompt", async () => {
    const llm = fakeLlm({ action: "accept", reason: "on-brief", score: 82 });
    const verdict = await reviewDeliverable(llm, brief, "landing_copy", textDeliverable(
      "Headline: Streaky — habit tracking, local-first. Privacy-first habit tracker for indie developers; " +
      "your data stays on your machine, no account, no cloud dependency, no subscription. Install now.",
    ));
    expect(verdict).toEqual({ action: "accept", reason: "on-brief", score: 82 });
    const prompt = (llm.completeJson as any).mock.calls[0][0] as string;
    expect(prompt).toContain("Streaky");
    expect(prompt).toContain("landing_copy");
    expect(prompt).toContain("builders");
    expect(prompt).toContain("playful");
    expect(prompt).toContain("local-first"); // the DELIVERABLE content must reach the QA prompt, not just the brief
    expect((llm.completeJson as any).mock.calls[0][1]).toBe(qaVerdictSchema);
  });

  it("passes through a redo verdict", async () => {
    const llm = fakeLlm({ action: "redo", reason: "off-tone" });
    const verdict = await reviewDeliverable(llm, brief, "research", textDeliverable(
      "Competitive analysis of the habit-tracker market covering incumbents, pricing models, and the " +
      "local-first positioning opportunity for indie developers seeking privacy and one-time purchases.",
    ));
    expect(verdict.action).toBe("redo");
  });

  it("downgrades an accept with a sub-threshold score to redo", async () => {
    const llm = fakeLlm({ action: "accept", reason: "meh but ok", score: 65 });
    const verdict = await reviewDeliverable(llm, brief, "landing_copy", textDeliverable(SUBSTANTIVE));
    expect(verdict.action).toBe("redo");
    expect(verdict.score).toBe(65);
    expect(verdict.reason).toMatch(/70/);
  });

  it("keeps an accept at or above the threshold", async () => {
    const llm = fakeLlm({ action: "accept", reason: "on-brief", score: 70 });
    const verdict = await reviewDeliverable(llm, brief, "research", textDeliverable(SUBSTANTIVE));
    expect(verdict.action).toBe("accept");
  });

  it("requires a score in the verdict schema", () => {
    expect(() => qaVerdictSchema.parse({ action: "accept", reason: "x" })).toThrow();
  });
});

describe("formatGate", () => {
  it("swaps an empty deliverable", () => {
    expect(formatGate("landing_copy", textDeliverable(""))?.action).toBe("swap");
  });

  it("swaps a redemption-code/link-only text deliverable (no inline prose)", () => {
    const g = formatGate("landing_copy", textDeliverable("Redeem at https://pygm.studio/r/ABC-123 code ABC-123"));
    expect(g?.action).toBe("swap");
    expect(g?.reason).toMatch(/inline/i);
  });

  it("passes substantive inline prose for a text leg (falls through to the LLM)", () => {
    expect(formatGate("landing_copy", textDeliverable(SUBSTANTIVE))).toBeNull();
    expect(formatGate("research", textDeliverable(SUBSTANTIVE))).toBeNull();
  });

  it("passes an og_image delivered as an image URL", () => {
    expect(formatGate("og_image", textDeliverable("https://cdn.example.com/og-1200x630.png"))).toBeNull();
  });

  it("passes an og_image delivered as a substantive spec (no URL)", () => {
    expect(formatGate("og_image", textDeliverable(SUBSTANTIVE))).toBeNull();
  });

  it("swaps an og_image that is only a redemption link (no image URL, no spec)", () => {
    const g = formatGate("og_image", textDeliverable("Access your image at https://pygm.studio/r/XYZ"));
    expect(g?.action).toBe("swap");
  });

  it("passes an og_image delivered as a schema url field with no file extension", () => {
    const d: Deliverable = { type: "schema", schema: { imageUrl: "https://cdn.foundr.io/abc123" }, contentHash: "0x" };
    expect(formatGate("og_image", d)).toBeNull();
  });

  it("passes an og_image whose url sits under a case-variant/alias schema field (imageURL/src)", () => {
    // Regression: extractImageRef must resolve these (else a valid image is wrongly swapped
    // AND the composed kit gets a hash-only ogImageRef).
    expect(formatGate("og_image", { type: "schema", schema: { imageURL: "https://cdn.foundr.io/abc123" }, contentHash: "0x" })).toBeNull();
    expect(formatGate("og_image", { type: "schema", schema: { src: "https://cdn.foundr.io/xyz789" }, contentHash: "0x" })).toBeNull();
  });

  it("swaps an og_image redemption link even when an image extension hides in the query string", () => {
    const g = formatGate("og_image", textDeliverable("Redeem at https://platform.com/redeem?img=logo.png"));
    expect(g?.action).toBe("swap"); // .png in the query is not a real image URL
  });
});

describe("reviewDeliverable format-gate integration", () => {
  it("returns swap WITHOUT calling the LLM when the format gate fires", async () => {
    const llm = fakeLlm({ action: "accept", reason: "should not be used", score: 99 });
    const verdict = await reviewDeliverable(llm, brief, "landing_copy", textDeliverable("code ABC-123"));
    expect(verdict.action).toBe("swap");
    expect((llm.completeJson as any)).not.toHaveBeenCalled();
  });
});
