import { describe, it, expect, vi } from "vitest";
import { fulfillOrder } from "./fulfill-order.js";
import { mockProvider } from "@/src/cap/mock-provider";
import type { DeliverReq } from "@/src/cap/provider";

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
  it("surfaces delivery failure instead of swallowing it (money already spent)", async () => {
    const provider = {
      ...mockProvider({ paysAfter: 0 }),
      deliverOrder: async () => { throw new Error("deliver boom"); },
    } as never;
    const onLog = vi.fn();
    await expect(fulfillOrder({ provider, runJob: async () => rec(), onLog, poll: noSleep })).rejects.toThrow(/deliver boom/);
    const logged = onLog.mock.calls.map((c) => c[0] as string);
    expect(logged.some((m) => /completed .* delivering/.test(m) || /spent/.test(m))).toBe(true);
  });
  it("rejects the order (not left hanging) when the engine throws", async () => {
    const provider = { ...mockProvider({ paysAfter: 0 }) };
    const rejectSpy = vi.spyOn(provider, "rejectOrder");
    const runJob = async () => { throw new Error("engine boom"); };
    const out = await fulfillOrder({ provider, runJob, poll: noSleep });
    expect(out).toEqual({ status: "rejected", orderId: "mock-order", reason: expect.stringMatching(/engine failed/) });
    expect(rejectSpy).toHaveBeenCalledWith("mock-order", expect.stringMatching(/engine failed/));
  });
  it("aborts early (skipped) on a real terminal pre-payment status, without running the engine", async () => {
    const provider = { ...mockProvider(), getOrder: async () => ({ status: "pay_failed", price: "2000000" }) } as never;
    const runJob = vi.fn(async () => rec());
    const out = await fulfillOrder({ provider, runJob, poll: noSleep });
    expect(runJob).not.toHaveBeenCalled();
    expect(out.status).toBe("skipped");
    expect(out.reason).toMatch(/pay_failed/);
  });
  it("returns and logs the deliver txHash", async () => {
    const onLog = vi.fn();
    const out = await fulfillOrder({ provider: mockProvider({ paysAfter: 0 }), runJob: async () => rec(), onLog, poll: noSleep });
    expect(out.status).toBe("delivered");
    expect(out.txHash).toMatch(/^0x/);
    expect(onLog.mock.calls.map((c) => c[0] as string).some((m) => /txHash 0x/.test(m))).toBe(true);
  });
  it("clamps a non-positive deliver.attempts to one attempt (never skips delivery post-spend)", async () => {
    // Before the clamp, attempts:0 skipped the loop and deref'd an undefined lastErr →
    // TypeError after the engine already spent, delivering nothing.
    const out = await fulfillOrder({ provider: mockProvider({ paysAfter: 0 }), runJob: async () => rec(), deliver: { attempts: 0, delayMs: 0 }, poll: noSleep });
    expect(out.status).toBe("delivered");
    expect(out.contentHash).toMatch(/^0x/);
  });
  it("retries a transient delivery failure before succeeding", async () => {
    let calls = 0;
    const provider = { ...mockProvider({ paysAfter: 0 }), deliverOrder: async (_o: string, _req: DeliverReq) => {
      calls++;
      if (calls < 3) throw new Error("transient deliver");
      return { contentHash: "0xok", txHash: "0xtx" };
    } } as never;
    const out = await fulfillOrder({ provider, runJob: async () => rec(), poll: noSleep });
    expect(calls).toBe(3);
    expect(out.status).toBe("delivered");
    expect(out.contentHash).toBe("0xok");
  });

  it("rejects (never accepts) when the fulfillability check fails", async () => {
    const provider = mockProvider({ paysAfter: 0 });
    const acceptSpy = vi.spyOn(provider, "acceptNegotiation");
    const rejectSpy = vi.spyOn(provider, "rejectNegotiation");
    const runJob = vi.fn(async () => rec());
    const checkFulfillable = async () => ({ ok: false, reason: "landing_copy: no live specialist matches this leg", perLeg: [] });
    const out = await fulfillOrder({ provider, runJob, checkFulfillable, poll: noSleep });
    expect(acceptSpy).not.toHaveBeenCalled();
    expect(runJob).not.toHaveBeenCalled();
    expect(rejectSpy).toHaveBeenCalledWith("mock-neg", expect.stringMatching(/cannot fulfill: landing_copy/));
    expect(out.status).toBe("rejected");
  });
  it("proceeds to accept + deliver when the fulfillability check passes", async () => {
    const provider = mockProvider({ brief: "a habit tracker", paysAfter: 0 });
    const acceptSpy = vi.spyOn(provider, "acceptNegotiation");
    const checkFulfillable = async () => ({ ok: true, perLeg: [{ leg: "research" as const, candidates: 1, affordable: 1 }] });
    const out = await fulfillOrder({ provider, runJob: async () => rec(), checkFulfillable, poll: noSleep });
    expect(acceptSpy).toHaveBeenCalled();
    expect(out.status).toBe("delivered");
  });
  it("skips the gate entirely when no checker is provided (back-compat)", async () => {
    const provider = mockProvider({ paysAfter: 0 });
    const out = await fulfillOrder({ provider, runJob: async () => rec(), poll: noSleep });
    expect(out.status).toBe("delivered");
  });
});
