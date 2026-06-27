import { describe, it, expect, vi } from "vitest";
import { composeKit } from "./compose.js";
import type { Llm } from "../llm/llm.js";
import type { LaunchAsset, LaunchBrief } from "../types.js";

const brief: LaunchBrief = { product: "Streaky", audience: "builders", features: ["streaks"], tone: "playful", oneLiner: "Track habits." };

const composed = {
  tweetThread: ["1/ Meet Streaky", "2/ It tracks habits"],
  shortPitch: "Streaky — habits, done.",
  phHnBlurb: "Show HN: Streaky",
  readmePolish: "# Streaky\nPolished.",
};

function fakeLlm(): Llm {
  return { completeText: vi.fn(async () => ""), completeJson: vi.fn(async () => composed) as Llm["completeJson"] };
}

function asset(leg: LaunchAsset["leg"], over: Partial<LaunchAsset> = {}): LaunchAsset {
  return {
    leg,
    hire: { leg, serviceId: "s", agentId: "a", agentName: "N", orderId: "o", chainOrderId: "c", priceBaseUnits: "100000", payTxHash: "0xp", deliverTxHash: "0xd", deliverable: { type: "text", text: `copy for ${leg}`, contentHash: "0xh" }, basescanPayUrl: "u", basescanDeliverUrl: "u" },
    verdict: { action: "accept", reason: "ok" },
    provenance: { leg, agentId: "a", agentName: "N", amountUsd: "0.10", contentHash: "0xh", payTxHash: "0xp", basescanUrl: "u" },
    ...over,
  };
}

describe("composeKit", () => {
  it("uses provider copy + image ref and the generated derived assets", async () => {
    const img = asset("og_image", { hire: { ...asset("og_image").hire, deliverable: { type: "text", text: "https://cdn/og.png", contentHash: "0xh" } } });
    const kit = await composeKit(fakeLlm(), brief, [asset("research"), asset("landing_copy"), img]);
    expect(kit.landingCopy).toBe("copy for landing_copy");
    expect(kit.ogImageRef).toBe("https://cdn/og.png");
    expect(kit.tweetThread).toEqual(composed.tweetThread);
    expect(kit.provenance).toHaveLength(3);
  });

  it("degrades gracefully when a leg is missing", async () => {
    const kit = await composeKit(fakeLlm(), brief, [asset("research")]);
    expect(kit.landingCopy).toBe("");
    expect(kit.ogImageRef).toBe("");
    expect(kit.phHnBlurb).toBe("Show HN: Streaky");
  });
});
