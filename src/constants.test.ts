import { describe, it, expect } from "vitest";
import { usdToBaseUnits, baseUnitsToUsd, BASE_USDC_ADDRESS, REQUIRED_LEGS } from "./constants.js";

describe("usdToBaseUnits", () => {
  it("converts whole and fractional dollars to 6-decimal base units", () => {
    expect(usdToBaseUnits("2.00")).toBe(2_000_000n);
    expect(usdToBaseUnits("0.10")).toBe(100_000n);
    expect(usdToBaseUnits("0.5")).toBe(500_000n);
    expect(usdToBaseUnits("1")).toBe(1_000_000n);
  });
  it("rejects malformed input naming the bad value", () => {
    expect(() => usdToBaseUnits("abc")).toThrow(/abc/);
    expect(() => usdToBaseUnits("1.2345678")).toThrow(/precision/);
  });
});

describe("baseUnitsToUsd", () => {
  it("formats base units back to a 2-dp dollar string", () => {
    expect(baseUnitsToUsd(100_000n)).toBe("0.10");
    expect(baseUnitsToUsd(2_000_000n)).toBe("2.00");
    expect(baseUnitsToUsd(1_888_624n)).toBe("1.89");
  });
});

describe("constants", () => {
  it("exposes Base mainnet USDC and the three required legs", () => {
    expect(BASE_USDC_ADDRESS.toLowerCase()).toBe("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
    expect(REQUIRED_LEGS).toEqual(["research", "landing_copy", "og_image"]);
  });
});
