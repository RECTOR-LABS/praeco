import { describe, it, expect, vi } from "vitest";
import { fulfillOrder } from "./fulfill-order.js";
import { mockProvider } from "@/src/cap/mock-provider";

const rec = (status = "completed", kit = true) => ({
  runId: "run-x", status, brief: { product: "P", audience: "a", features: [], tone: "t", oneLiner: "o" },
  assets: kit ? [{}] : [], spentBaseUnits: "700000", startedAt: 1, endedAt: 2, worklog: [],
  kit: kit ? { landingCopy: "c", ogImageRef: "hash:0x", tweetThread: ["t"], shortPitch: "s", phHnBlurb: "p", readmePolish: "r", provenance: [] } : undefined,
}) as never;
const noSleep = { attempts: 5, delayMs: 0, sleep: async () => {} };

describe("fulfillOrder", () => {
  it("accepts, waits for paid, runs, delivers, returns contentHash", async () => {
    const provider = mockProvider({ brief: "a habit tracker", paysAfter: 1 });
    const runJob = vi.fn(async () => rec());
    const out = await fulfillOrder({ provider, runJob, poll: noSleep });
    expect(runJob).toHaveBeenCalledWith({ text: "a habit tracker" });
    expect(out.status).toBe("delivered");
    expect(out.contentHash).toMatch(/^0x/);
    expect(provider.delivered[0].deliverableText).toContain("habit"); // brief flows into the kit md? at least product/pitch present
  });
  it("does NOT run the engine if the order never gets paid", async () => {
    const provider = mockProvider({ paysAfter: 99 });
    const runJob = vi.fn(async () => rec());
    const out = await fulfillOrder({ provider, runJob, poll: { attempts: 3, delayMs: 0, sleep: async () => {} } });
    expect(runJob).not.toHaveBeenCalled();
    expect(out.status).toBe("skipped");
  });
  it("rejects a negotiation with no brief (never accepts)", async () => {
    const provider = mockProvider({ brief: "" });
    // brief "" → requirements {brief:""} → invalid
    const acceptSpy = vi.spyOn(provider, "acceptNegotiation");
    const rejectSpy = vi.spyOn(provider, "rejectNegotiation");
    const out = await fulfillOrder({ provider, runJob: vi.fn(async () => rec()), poll: noSleep });
    expect(acceptSpy).not.toHaveBeenCalled();
    expect(rejectSpy).toHaveBeenCalled();
    expect(out.status).toBe("rejected");
  });
  it("skips cleanly when there are no inbound negotiations", async () => {
    const provider = { ...mockProvider(), listInboundNegotiations: async () => [] } as never;
    const out = await fulfillOrder({ provider, runJob: vi.fn(async () => rec()), poll: noSleep });
    expect(out.status).toBe("skipped");
  });
  it("still delivers a partial run with a note", async () => {
    const provider = mockProvider({ paysAfter: 0 });
    const out = await fulfillOrder({ provider, runJob: async () => rec("partial", false), poll: noSleep });
    expect(out.status).toBe("delivered");
    expect(provider.delivered[0].deliverableText).toMatch(/partial/i);
  });
  it("calls assertFunded before accepting", async () => {
    const provider = mockProvider({ paysAfter: 0 });
    const assertFunded = vi.fn(async () => {});
    await fulfillOrder({ provider, runJob: async () => rec(), assertFunded, poll: noSleep });
    expect(assertFunded).toHaveBeenCalled();
  });
});
