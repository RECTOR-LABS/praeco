import { describe, it, expect } from "vitest";
import { deliverableToText, extractImageRef, toProvenanceCard } from "./provenance.js";
import type { HireResult } from "../types.js";

describe("deliverableToText", () => {
  it("prefers text, falls back to stringified schema, else empty", () => {
    expect(deliverableToText({ type: "text", text: "hello", contentHash: "0x" })).toBe("hello");
    expect(deliverableToText({ type: "schema", schema: { a: 1 }, contentHash: "0x" })).toBe('{"a":1}');
    expect(deliverableToText({ type: "text", contentHash: "0x" })).toBe("");
  });
  it("treats whitespace-only text as empty and falls back to schema", () => {
    expect(deliverableToText({ type: "text", text: "   ", schema: { a: 1 }, contentHash: "0x" })).toBe('{"a":1}');
  });
});

describe("extractImageRef", () => {
  it("returns a direct URL from text", () => {
    expect(extractImageRef({ type: "text", text: "https://cdn/img.png", contentHash: "0x" })).toBe("https://cdn/img.png");
  });
  it("finds a url-ish field inside a schema deliverable", () => {
    expect(extractImageRef({ type: "schema", schema: { imageUrl: "https://cdn/og.png" }, contentHash: "0x" })).toBe("https://cdn/og.png");
    expect(extractImageRef({ type: "schema", schema: { url: "https://cdn/u.png" }, contentHash: "0x" })).toBe("https://cdn/u.png");
  });
  it("rejects junk-after-url text and falls back to hash", () => {
    expect(extractImageRef({ type: "text", text: "https://cdn/img.png (generated)", contentHash: "0xabc" })).toBe("hash:0xabc");
  });
  it("trims trailing whitespace and returns clean URLs", () => {
    expect(extractImageRef({ type: "text", text: "https://cdn/og.png\n", contentHash: "0x" })).toBe("https://cdn/og.png");
  });
  it("falls back to a content-hash reference when no URL is present", () => {
    expect(extractImageRef({ type: "schema", schema: { foo: "bar" }, contentHash: "0xabc" })).toBe("hash:0xabc");
  });
});

describe("toProvenanceCard", () => {
  it("maps a hire result to a provenance card with a dollar amount", () => {
    const hire = {
      leg: "research", serviceId: "s", agentId: "a", agentName: "OpsPilot",
      orderId: "o", chainOrderId: "c", priceBaseUnits: "100000", payTxHash: "0xpay",
      deliverTxHash: "0xd", deliverable: { type: "text", contentHash: "0xhash" },
      basescanPayUrl: "https://basescan.org/tx/0xpay", basescanDeliverUrl: "https://basescan.org/tx/0xd",
    } as HireResult;
    const card = toProvenanceCard(hire);
    expect(card).toMatchObject({ leg: "research", agentName: "OpsPilot", amountUsd: "0.10", contentHash: "0xhash", payTxHash: "0xpay", basescanUrl: "https://basescan.org/tx/0xpay" });
  });
});
