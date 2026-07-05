import { parseArgs, estimateCredits, buildTtsUrl } from "./tts";

test("parseArgs reads text, voices, model, out, and flags", () => {
  const a = parseArgs(["--text", "hello there", "--voices", "v1,v2", "--model", "eleven_flash_v2_5", "--out", "x.mp3", "--dry-run"]);
  expect(a.text).toBe("hello there");
  expect(a.voices).toEqual(["v1", "v2"]);
  expect(a.model).toBe("eleven_flash_v2_5");
  expect(a.out).toBe("x.mp3");
  expect(a.dryRun).toBe(true);
});

test("parseArgs defaults model to multilingual_v2 and dryRun false", () => {
  const a = parseArgs(["--text", "hi", "--voices", "v1"]);
  expect(a.model).toBe("eleven_multilingual_v2");
  expect(a.dryRun).toBe(false);
});

test("flash/turbo models bill 0.5 credits/char; others 1.0", () => {
  expect(estimateCredits(100, "eleven_flash_v2_5")).toBe(50);
  expect(estimateCredits(100, "eleven_turbo_v2_5")).toBe(50);
  expect(estimateCredits(100, "eleven_multilingual_v2")).toBe(100);
});

test("buildTtsUrl targets the voice with an mp3 output format", () => {
  expect(buildTtsUrl("abc123")).toBe(
    "https://api.elevenlabs.io/v1/text-to-speech/abc123?output_format=mp3_44100_128"
  );
});
