import { it, expect } from "vitest";
import { elapsedLabel } from "./BrainBar";

it("elapsedLabel progresses from lastEventAt while the run is still playing (no endedAt)", () => {
  const started = 1_000_000;
  // Bug regression: mid-play the clock must reflect lastEventAt, not sit at 0s.
  expect(elapsedLabel(started, undefined, started + 5_000)).toBe("5s");
  expect(elapsedLabel(started, undefined, started + 125_000)).toBe("2m 5s");
});

it("elapsedLabel uses endedAt once the run has completed", () => {
  const started = 1_000_000;
  expect(elapsedLabel(started, started + 143_000, started + 143_000)).toBe("2m 23s");
});

it("elapsedLabel handles the pre-start and just-started edges", () => {
  expect(elapsedLabel(undefined)).toBe("—");
  expect(elapsedLabel(1_000_000, undefined, 1_000_000)).toBe("0s"); // first event only
});
