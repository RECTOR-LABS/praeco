import { computeFit, estimateChars } from "./fit";

test("audio shorter than video → pad the remainder with silence", () => {
  expect(computeFit(30, 24)).toEqual({ action: "pad", atempo: 1, padSeconds: 6 });
});

test("audio ≤8% longer → gentle atempo speed-up, no pad", () => {
  const plan = computeFit(30, 32); // 6.7% over
  expect(plan.action).toBe("atempo");
  expect(plan.atempo).toBeCloseTo(1.067, 2);
  expect(plan.padSeconds).toBe(0);
});

test("audio >8% longer → retrim (copy must be shortened), atempo clamped", () => {
  const plan = computeFit(30, 40);
  expect(plan.action).toBe("retrim");
  expect(plan.atempo).toBe(1.08);
});

test("non-positive durations throw", () => {
  expect(() => computeFit(0, 10)).toThrow();
  expect(() => computeFit(10, -1)).toThrow();
});

test("estimateChars sizes copy to a duration at ~15 cps with 10% margin", () => {
  expect(estimateChars(30)).toBe(405); // floor(30 * 15 * 0.9)
});
