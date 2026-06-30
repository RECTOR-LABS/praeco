import { it, expect, afterEach } from "vitest";
import { parseStartRequest, assertLiveAllowed, assertCapacity, GateError } from "./gating.js";

afterEach(() => { delete process.env.LIVE_RUN_TOKEN; });

it("accepts a one-liner sandbox request", () => {
  expect(parseStartRequest({ mode: "sandbox", text: "A privacy-first tracker" })).toEqual({ mode: "sandbox", text: "A privacy-first tracker" });
});
it("accepts a github repo url", () => {
  expect(parseStartRequest({ mode: "sandbox", repoUrl: "https://github.com/a/b" }).repoUrl).toBe("https://github.com/a/b");
});
it("rejects a non-github url", () => {
  expect(() => parseStartRequest({ mode: "sandbox", repoUrl: "https://evil.com/a/b" })).toThrow(GateError);
});
it("rejects empty input", () => {
  expect(() => parseStartRequest({ mode: "sandbox" })).toThrow(/text or repoUrl/);
});
it("403s a live request without the token", () => {
  process.env.LIVE_RUN_TOKEN = "secret";
  expect(() => assertLiveAllowed(new Headers())).toThrow(GateError);
  expect(() => assertLiveAllowed(new Headers({ Authorization: "Bearer secret" }))).not.toThrow();
});
it("403s a live request when LIVE_RUN_TOKEN is not configured", () => {
  const prev = process.env.LIVE_RUN_TOKEN;
  delete process.env.LIVE_RUN_TOKEN;
  try {
    expect(() => assertLiveAllowed(new Headers({ Authorization: "Bearer anything" }))).toThrow(GateError);
  } finally {
    if (prev !== undefined) process.env.LIVE_RUN_TOKEN = prev;
  }
});
it("rejects at the live cap and allows below it", () => {
  expect(() => assertCapacity(1, "live")).toThrow(GateError);
  expect(() => assertCapacity(0, "live")).not.toThrow();
  expect(() => assertCapacity(3, "sandbox")).toThrow(GateError);
  expect(() => assertCapacity(2, "sandbox")).not.toThrow();
});
it("rejects text shorter than 3 chars and accepts 3", () => {
  expect(() => parseStartRequest({ mode: "sandbox", text: "hi" })).toThrow(GateError);
  expect(parseStartRequest({ mode: "sandbox", text: "abc" }).text).toBe("abc");
});
