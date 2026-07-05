import { audioFilter, parseManifest } from "./compile";

test("pad plan → apad with the trailing silence duration + loudnorm", () => {
  expect(audioFilter({ action: "pad", atempo: 1, padSeconds: 6 }))
    .toBe("apad=pad_dur=6,loudnorm");
});

test("atempo plan → atempo then loudnorm", () => {
  expect(audioFilter({ action: "atempo", atempo: 1.067, padSeconds: 0 }))
    .toBe("atempo=1.067,loudnorm");
});

test("retrim plan is rejected — copy must be shortened first", () => {
  expect(() => audioFilter({ action: "retrim", atempo: 1.08, padSeconds: 0 })).toThrow();
});

test("parseManifest returns the chunk list", () => {
  const chunks = parseManifest('[{"beat":"1","video":"video/raw/1.mov","audio":"video/audio/1.mp3"}]');
  expect(chunks).toEqual([{ beat: "1", video: "video/raw/1.mov", audio: "video/audio/1.mp3" }]);
});

test("parseManifest rejects a missing field", () => {
  expect(() => parseManifest('[{"beat":"1","video":"x"}]')).toThrow();
});
