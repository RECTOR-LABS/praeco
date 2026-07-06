import { audioFilter, parseManifest, videoFilter } from "./compile";

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

test("videoFilter without cues builds the blur-fill graph, no overlays", () => {
  const g = videoFilter();
  expect(g).toContain("[0:v]split[bg][fg]");
  expect(g).toContain("overlay=(W-w)/2:(H-h)/2");
  expect(g.endsWith("fps=30[v]")).toBe(true);
  expect(g).not.toContain("enable=");
});

test("videoFilter overlays one caption input per cue on its own time window", () => {
  const g = videoFilter(
    [
      { start: 0.1, end: 2.0, text: "one" },
      { start: 2.1, end: 4.0, text: "two" },
    ],
    2
  );
  // blur-fill composited to [base], then a chained overlay per cue
  expect(g).toContain("fps=30[base]");
  expect(g).toContain("[base][2:v]overlay=0:0:enable='between(t,0.1,2)'");
  expect(g).toContain("[3:v]overlay=0:0:enable='between(t,2.1,4)'");
  expect(g.endsWith("[v]")).toBe(true);
});
