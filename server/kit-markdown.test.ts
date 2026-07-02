import { describe, it, expect } from "vitest";
import type { RunRecord } from "@/src/types";
import { kitToMarkdown, kitProvenanceJson } from "./kit-markdown.js";

const rec = {
  runId: "run-1", status: "completed",
  brief: { product: "Streaky", audience: "indie devs", features: ["local"], tone: "calm", oneLiner: "Local-first habits." },
  assets: [], spentBaseUnits: "700000", startedAt: 1, endedAt: 2, worklog: [],
  kit: {
    landingCopy: "Headline: Streaky", ogImageRef: "hash:0ximg", tweetThread: ["t1", "t2"],
    shortPitch: "Local-first habits.", phHnBlurb: "PH blurb", readmePolish: "# Streaky",
    provenance: [{ leg: "research", agentId: "a", agentName: "Foundr", amountUsd: "0.10", contentHash: "0xh", payTxHash: "0xp", basescanUrl: "https://basescan.org/tx/0xp" }],
  },
} as RunRecord;

describe("kit-markdown", () => {
  it("renders the kit sections as markdown", () => {
    const md = kitToMarkdown(rec);
    expect(md).toContain("Streaky");
    expect(md).toContain("Headline: Streaky");
    expect(md).toContain("t1");
    expect(md).toContain("Foundr");
    expect(md).toContain("basescan.org/tx/0xp");
  });
  it("notes graceful degradation when there is no kit", () => {
    const md = kitToMarkdown({ ...rec, status: "failed", kit: undefined });
    expect(md).toMatch(/no kit|failed|partial/i);
  });
  it("emits provenance JSON", () => {
    const j = JSON.parse(kitProvenanceJson(rec));
    expect(j.runId).toBe("run-1");
    expect(j.provenance[0].agentName).toBe("Foundr");
  });
});
